const Promise = require('bluebird')
const path = require('path')
const fs = Promise.promisifyAll(require('fs'))
const child = Promise.promisifyAll(require('child_process'))
const http = require('http')
const https = require('https')
const url = require('url')

const execAsync = child.execAsync
const rimraf = require('rimraf')
const mkdirp = require('mkdirp')
const rimrafAsync = Promise.promisify(rimraf)
const mkdirpAsync = Promise.promisify(mkdirp)

const exAsync = Promise.promisify(require('./lib/exec'))
const cog = require('./lib/cog')

const fetch = Promise.promisifyAll(require('./lib/fetch'))
const partUUID = require('./lib/partUUID')

if (process.getuid()) {
  console.log('this script requires root priviledge')
  process.exit()
}

let args = process.argv.slice(2)
args.forEach(arg => {})

const qemus = 'usr/bin/qemu-aarch64-static'

// no root and alt root, only partition p, swap and tmpfs
const fstab = `\
# <file system>                             <mount point>     <type>  <options>                   <dump>  <fsck>
UUID=0cbc36fa-3b85-40af-946e-f15dce29d86b   /mnt/persistent   ext4    defaults                    0       1
UUID=f0bc3049-049f-4e8e-8215-55f48add603f   none              swap    sw                          0       0
tmpfs                                       /var/log          tmpfs   nodev,nosuid,size=64M       0       0
`

const createFile = (file, data, callback) => {
  let rpath = path.join('out', 'rootfs', file) 
  mkdirp(path.dirname(rpath), err => {
    if (err) {
      callback(err)
    } else {
      fs.writeFile(rpath, data, callback)
    }
  })
}

const createFileAsync = Promise.promisify(createFile)

const chrootExec = (cmd, callback) => {
  let args = [ 'out/rootfs', '/bin/bash', '-c', cmd]

  cog(['chroot', ...args].join(' '))

  let opts = { stdio: 'inherit' }
  let c = child.spawn('chroot', args, opts)
  c.on('error', err => callback(err))
  c.on('close', () => callback(null))
} 

const cexecAsync = Promise.promisify(chrootExec)

const hosts = `
127.0.0.1 localhost
127.0.1.1 winas

# The following lines are desirable for IPv6 capable hosts
::1     localhost ip6-localhost ip6-loopback
ff02::1 ip6-allnodes
ff02::2 ip6-allrouters
`

// don't set eth0, nm will manage it. not ifupdown
const networkInterfaces = `
# interfaces(5) file used by ifup(8) and ifdown(8)
# Include files from /etc/network/interfaces.d:
# auto eth0
# allow-hotplug eth0
# iface eth0 inet dhcp

auto lo
iface lo inet loopback
`

// dns=systemd-networkd is not required
const nmconf = 
`[main]
plugins=ifupdown,keyfile

[ifupdown]
managed=true

[device]
wifi.scan-rand-mac-address=no
`

;(async () => {
  let ubuntu, kernel, node

  await exAsync('mkdir -p assets')
  await exAsync('rm -rf tmp')
  await exAsync('mkdir -p tmp')

  ubuntu = await fetch.ubuntuAsync() 
  node = await fetch.nodeAsync()
  kernel = await fetch.kernelAsync()
  ffmpegs = await fetch.ffmpegsAsync()

  cog('- all required blobs are ready')

  await exAsync(`rm -rf out`)
  await exAsync(`mkdir -p out/rootfs`)
  await exAsync(`tar xzf assets/${ubuntu.filename} -C out/rootfs`) 

  do {
    await exAsync(`tar xJf assets/${ffmpegs.filename} -C tmp`)

    let ms = (await fs.readdirAsync('tmp')).map(name => name.match(/^ffmpeg-git-(\d+)-arm64-static$/)).filter(x => !!x)
    if (ms.length !== 1) throw new Error('unexpected name for extracted ffmpeg static')
    let m = ms[0]
    let dirname = m[0] 
    ffmpegs.ver = m[1]   
    ffmpegs.tag = m[1] 

    await exAsync(`cp tmp/${dirname}/ffmpeg out/rootfs/bin/ffmpeg`)
    await exAsync(`cp tmp/${dirname}/ffprobe out/rootfs/bin/ffprobe`)
  } while (0)

  do {
    await exAsync(`tar xJf assets/${node.filename} --strip-components=1 -C out/rootfs/usr`)
  } while (0)

  await exAsync(`cp assets/${kernel.filename} out/rootfs`)

  await exAsync(`cp /${qemus} out/rootfs/${qemus}`)

  await createFileAsync('etc/resolv.conf', await fs.readFileAsync('/etc/resolv.conf'))
  await createFileAsync('etc/hosts', hosts)
  await createFileAsync('etc/hostname', 'winas\n')
  await createFileAsync('etc/network/interfaces', networkInterfaces)
  await createFileAsync('etc/timezone', 'Asia/Shanghai\n')

  cog('mounting special file system for chroot')

  await exAsync('mount -t proc chproc out/rootfs/proc')
  await exAsync('mount -t sysfs chsys out/rootfs/sys')
  await exAsync('mount -t devtmpfs chdev out/rootfs/dev')
  await exAsync('mount -t devpts chpts out/rootfs/dev/pts')

  cog('mounted')

  await cexecAsync(`apt update`)
  await cexecAsync(`apt -y upgrade`)

  let packages = [
    'initramfs-tools', 
    'u-boot-tools',
    'net-tools',
    'btrfs-tools',
    'tzdata',
    'wireless-tools',
    'bluez',
    'bluetooth',
    'sudo', 
    'openssh-server',
    'network-manager',
    'avahi-daemon',
    'avahi-utils',
    // 'libimage-exiftool-perl',
    'imagemagick',
    'samba',
    'rsyslog',
    'minidlna',
    'overlayroot'
  ]

  // install packages
  if (packages.length) {
    await cexecAsync(`DEBIAN_FRONTEND=noninteractive apt -y install --no-install-recommends ${packages.join(' ')}`)
  }

  // create first user
  await cexecAsync(`useradd winas -b /home -m -s /bin/bash`)
  await cexecAsync(`echo winas:winas | chpasswd`)

  if (packages.includes('sudo')) {
    await cexecAsync(`adduser winas sudo`)
  }

  // install kernel
  await cexecAsync(`dpkg -i ${kernel.filename}`)
  await cexecAsync(`ln -s vmlinuz-${kernel.ver} /boot/Image`)
  if (packages.includes('u-boot-tools')) {
    await cexecAsync(`mkimage -A arm64 -O linux -T ramdisk -C gzip -n uInitrd -d /boot/initrd.img-${kernel.ver} /boot/uInitrd-${kernel.ver}`)
    await cexecAsync(`ln -s uInitrd-${kernel.ver} /boot/uInitrd`)
  }
  await cexecAsync(`cp /usr/lib/linux-image-${kernel.ver}/rockchip/rk3328-rock64.dtb /boot/rk3328-rock64.dtb`)
  await cexecAsync(`ln -s rk3328-rock64.dtb /boot/dtb`)
  await cexecAsync(`rm -rf ${kernel.filename}`)

  // enable systemd-resolved
  await cexecAsync(`systemctl enable systemd-resolved`)
  // disable apt daily & motd-news
  await cexecAsync(`systemctl disable apt-daily-upgrade.timer apt-daily.timer motd-news.timer`)
  await cexecAsync(`apt -y remove u-boot-tools initramfs-tools overlayroot`)
  await cexecAsync(`apt -y autoremove`)
  await cexecAsync(`apt clean --dry-run`) 
  await cexecAsync(`apt clean`) 
  await Promise.delay(1000)

  // await cexecAsync(`apt -y --allow-remove-essential remove apt`)

  cog('un-mounting special file system for chroot')

  await exAsync('umount -l out/rootfs/dev/pts')
  await exAsync('umount -l out/rootfs/dev')
  await exAsync('umount -l out/rootfs/sys')
  await exAsync('umount -l out/rootfs/proc')

  cog('un-mounted')

  await exAsync(`rm -rf out/rootfs/var/lib/apt/lists`)
  await exAsync(`mkdir -p out/rootfs/var/lib/apt/lists`)

  // remove qemu static
  await exAsync(`rm out/rootfs/${qemus}`)
  // systemd-resolved
  // await rimrafAsync(path.join('out', 'rootfs', 'etc/resolv.conf'))
  await exAsync('rm out/rootfs/etc/resolv.conf') 
  await exAsync(`ln -sf /run/systemd/resolve/resolv.conf out/rootfs/etc/resolv.conf`)
  // network manager
  if (packages.includes('network-manager')) {
    await createFileAsync('etc/NetworkManager/NetworkManager.conf', nmconf)
    await createFileAsync('etc/NetworkManager/conf.d/10-globally-managed-devices.conf', '')
  }
  // fstab
  await createFileAsync('etc/fstab', fstab)
  // overlayroot
  await createFileAsync('etc/overlayroot.conf', 'overlayroot="tmpfs:swap=1,recurse=0"')

  await mkdirpAsync('out/rootfs/tmp')
  await mkdirpAsync('out/rootfs/var/volatile')
  await mkdirpAsync('out/rootfs/mnt/alt')
  await mkdirpAsync('out/rootfs/mnt/persistent')
  await mkdirpAsync('out/rootfs/winas')
  
  await exAsync('mkdir -p out/p/boot')
  await exAsync('cp assets/boot.cmd out/p/boot/boot.cmd')
  await exAsync(`mkimage -C none -A arm -T script -d out/p/boot/boot.cmd out/p/boot/boot.scr`)

  await exAsync('mkdir -p out/p/overlay/etc')

  if (packages.includes('network-manager')) {
    await exAsync('mv out/rootfs/etc/NetworkManager out/p/overlay/etc')
    await exAsync('ln -s /mnt/persistent/overlay/etc/NetworkManager out/rootfs/etc/NetworkManager')
  }

  await exAsync(`tar czf out/rootfs.tar.gz -C out/rootfs .`)

  cog('rootfs.tar.gz is ready')

  await exAsync(`tar czf out/p.tar.gz -C out/p .`)

  cog('p.tar.gz is ready')
})().then(() => {}).catch(e => console.log(e))
