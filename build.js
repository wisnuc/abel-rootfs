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

const partUUID = require('./lib/partUUID')
const fetch = require('./lib/fetch')

let ubuntuVer = '18.04.1'
let ubuntuTar = `ubuntu-base-${ubuntuVer}-base-arm64.tar.gz`

let nodeTar
let nodeVer

// these are set by getKernel function
// example: 
// tag: 4.19.0-0000
// ver: 4.19.0
// deb: 
let kernelTag
let kernelVer
let kernelDeb

if (process.getuid()) {
  console.log('this script requires root priviledge')
  process.exit()
}

let args = process.argv.slice(2)
args.forEach(arg => {})

// no root and alt root, only partition p, swap and tmpfs
const fstab = `
# <file system>                             <mount point>     <type>  <options>                   <dump>  <fsck>
UUID=0cbc36fa-3b85-40af-946e-f15dce29d86b   /mnt/persistent   ext4    defaults                    0       1
UUID=f0bc3049-049f-4e8e-8215-55f48add603f   none              swap    sw                          0       0
tmpfs                                       /tmp              tmpfs   nodev,nosuid,size=64M       0       0
tmpfs                                       /var/log          tmpfs   nodev,nosuid,size=64M       0       0
tmpfs                                       /var/volatile     tmpfs   nodev,nosuid,size=64M       0       0
/var/volatile/lib                           /var/lib          none    bind                        0       0
/var/volatile/tmp                           /var/tmp          none    bind                        0       0
`

const getNode = callback => {
  console.log('retrieving latest node.js lts releases')
  fetch('https://api.github.com/repos/nodejs/node/releases', (err, body) => {
    if (err) {
      callback(err)
    } else {
      let vs = body.filter(x => !x.prerelease)
        .map(x => x.tag_name.split('.'))
        .map(xs => ({ major: parseInt(xs[0].slice(1)), minor: parseInt(xs[1]), revision: parseInt(xs[2]) }))
        .sort((a, b) => a.major - b.major ? a.major - b.major : a.minor - b.minor ? a.minor - b.minor : a.revision - b.revision)
        .reverse()

      let v = vs.find(v => v.major === 10) // LTS version
      let tag = `v${v.major}.${v.minor}.${v.revision}`
      let filename = `node-${tag}-linux-arm64.tar.xz`
      let target = path.join('assets', filename)
      fs.stat(target, (err, stats) => {
        if (err && err.code === 'ENOENT') {
          console.log(`downloading ${filename}`)
          let href = `https://nodejs.org/dist/${tag}/${filename}`
          let contentType = 'application/x-xz'
          let tmpfile = path.join('tmp', filename)
          fetch({ href, contentType, filename, tmpfile, target }, err => {
            if (err) {
              console.log(`download failed, ${err.message}`)
              callback(err)
            } else {
              console.log(`${target} downloaded`)
              nodeVer = tag
              nodeTar = target
              callback(null)
            }
          })
        } else if (err) {
          callback(err)
        } else {
          console.log(`${target} exists, skip download`)
          nodeVer = tag
          nodeTar = target
          callback()
        }
      })
    }
  })
}

const getUbuntu = callback => 
  fs.stat(path.join('assets', ubuntuTar), (err, stats) => {
    if (err && err.code === 'ENOENT') {
      console.log(`downloading ${ubuntuTar}`)
      let filename = ubuntuTar
      let href = `http://cdimage.ubuntu.com/ubuntu-base/releases/${ubuntuVer}/release/${filename}`
      let contentType = 'application/x-gzip'
      let tmpfile = path.join('tmp', filename)
      let target = path.join('assets', filename)
      let progress = fetch({ href, contentType, filename, tmpfile, target }, err => {
        clearInterval(timer)
        if (err) {
          console.log(`download failed, ${err.message}`)
          callback(err)
        } else {
          console.log(`download finished`)
          callback(null)
        }
      })

      let timer = setInterval(() => {
        let p = progress()
        if (p) {
          let per
          if (p.contentLength) {
            per = new Intl.NumberFormat('en-US', {
              style: 'decimal',
              minimumIntegerDigits: 2,
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }).format(p.bytesWritten * 100/p.contentLength)

            console.log(`${p.bytesWritten}, ${per}%`)
          } else {
            console.log(`${p.bytesWritten}`)
          }
        }
      }, 1000)
    } else if (err) {
      callback(err)
    } else {
      console.log(`${ubuntuTar} exists, skip download`)
      callback()
    }
  })

const getKernel = callback => {
  console.log('retrieving latest (mainline) kernel package')
  fetch('https://api.github.com/repos/wisnuc/abel-mainline-kernel/releases', (err, releases) => {
    if (err) {
      callback(err)
    } else {
      let latest = releases[0]
      let tag = latest.tag_name
      let filename = `linux-image-${tag}-arm64.deb`
      let image = latest.assets.find(x => x.name === filename)
      if (!image) return callback(new Error('kernel package not found'))

      // TODO skip download if exists

      let href = image.url
      let contentType = 'application/octet-stream'
      let tmpfile = path.join('tmp', filename)
      let target = path.join('assets', filename)

      fs.stat(target, err => {
        if (err && err.code === 'ENOENT') {
          fetch({ href, filename, contentType, tmpfile, target }, err => {
            if (err) {
              console.log(`download failed, ${err.message}`)
              callback(err)
            } else {
              kernelTag = tag
              kernelVer = tag.split('-')[0]
              kernelDeb = filename
              callback()
            }
          })
        } else if (err) {
          callback(err)
        } else {
          console.log(`${target} exists, skip download`)
          kernelTag = tag
          kernelVer = tag.split('-')[0]
          kernelDeb = filename
          console.log(kernelTag, kernelVer, kernelDeb)
          callback(null)
        }
      })

    }
  })
}

const getUbuntuAsync = Promise.promisify(getUbuntu)
const getNodeAsync = Promise.promisify(getNode)
const getKernelAsync = Promise.promisify(getKernel)

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

const bootenv = uuid => `
verbosity=1
console=bothoverlay_prefix=rk3328
rootfstype=ext4
usbstoragequirks=0x2537:0x1066:u,0x2537:0x1068:u
partnum=2
rootdev=UUID=${uuid}
`

;(async () => {
  await mkdirp('assets')
  await rimrafAsync('tmp')
  await mkdirpAsync('tmp')

  await getUbuntuAsync()
  await getNodeAsync()
  await getKernelAsync()

  console.log('all required blobs are ready')

  await rimrafAsync('out')
  await mkdirpAsync('out/rootfs')

  console.log('extracting ubuntu-base')

  await execAsync(`tar xzf assets/${ubuntuTar} -C out/rootfs`) 

  await fs.copyFileAsync(path.join('assets', kernelDeb), path.join('out', 'rootfs', kernelDeb))

  let qemu = (await execAsync('which qemu-aarch64-static')).trim()
  await fs.copyFileAsync(qemu, path.join('out', 'rootfs', qemu))

  // await createFileAsync('etc/systemd/network/wired.network', wiredNetwork)
  await createFileAsync('etc/resolv.conf', await fs.readFileAsync('/etc/resolv.conf'))
  await createFileAsync('etc/hosts', hosts)
  await createFileAsync('etc/hostname', 'winas\n')
  await createFileAsync('etc/network/interfaces', networkInterfaces)
  console.log('mounting special file system for chroot')

  await execAsync('mount -t proc chproc out/rootfs/proc')
  await execAsync('mount -t sysfs chsys out/rootfs/sys')
  await execAsync('mount -t devtmpfs chdev out/rootfs/dev')
  await execAsync('mount -t devpts chpts out/rootfs/dev/pts')
  console.log('mounted')

  await cexecAsync(`apt update`)
  await cexecAsync(`apt -y upgrade`)

  let packages = [
    'initramfs-tools', 
    'ifupdown',
    'net-tools',
    'btrfs-tools',
    'u-boot-tools',
    'wireless-tools',
    'sudo', 
    'vim',
    'openssh-server',
    'network-manager',
    'avahi-daemon',
    'avahi-utils',
    'udisks2',
    'libimage-exiftool-perl',
    'imagemagick',
    'ffmpeg',
    'samba',
    'rsyslog',
    'minidlna'
  ]

  await cexecAsync(`apt -y install ${packages.join(' ')}`)
  await cexecAsync(`useradd winas -b /home -m -s /bin/bash`)
  await cexecAsync(`echo winas:winas | chpasswd`)
  await cexecAsync(`adduser winas sudo`)

  console.log('[[ installing kernel package ]]')

  await cexecAsync(`dpkg -i ${kernelDeb}`)
  await cexecAsync(`ln -s vmlinuz-${kernelVer} /boot/Image`)
  await cexecAsync(`mkimage -A arm64 -O linux -T ramdisk -C gzip -n uInitrd`
    + ` -d /boot/initrd.img-${kernelVer} /boot/uInitrd-${kernelVer}`)
  await cexecAsync(`ln -s uInitrd-${kernelVer} /boot/uInitrd`)
  await cexecAsync(`cp /usr/lib/linux-image-${kernelVer}/rockchip/rk3328-rock64.dtb /boot/rk3328-rock64.dtb`)
  await cexecAsync(`ln -s rk3328-rock64.dtb /boot/dtb`)

  // dns & network
  await cexecAsync(`systemctl enable systemd-resolved`)
  await cexecAsync(`systemctl enable NetworkManager`)
  await cexecAsync(`systemctl disable smbd nmbd minidlna`)

  await cexecAsync(`apt clean`) 

  console.log('un-mounting special file system for chroot')
  await execAsync('umount -l out/rootfs/dev/pts')
  await execAsync('umount -l out/rootfs/dev')
  await execAsync('umount -l out/rootfs/sys')
  await execAsync('umount -l out/rootfs/proc')
  console.log('un-mounted')

  // update conf
  await createFileAsync('etc/NetworkManager/NetworkManager.conf', nmconf)
  await createFileAsync('etc/NetworkManager/conf.d/10-globally-managed-devices.conf', '')
  await rimrafAsync(path.join('out', 'rootfs', 'etc/resolv.conf'))
  await execAsync(`ln -sf /run/systemd/resolve/resolv.conf out/rootfs/etc/resolv.conf`)

  await rimrafAsync(path.join('out', 'rootfs', kernelDeb)) 

  await mkdirpAsync('out/rootfs/tmp')
  await mkdirpAsync('out/rootfs/var/volatile')
  await mkdirpAsync('out/rootfs/mnt/alt')
  await mkdirpAsync('out/rootfs/mnt/persistent')
  await mkdirpAsync('out/rootfs/winas')
  
  await createFileAsync('etc/fstab', fstab)

  await mkdirpAsync('out/p/boot')
  await fs.copyFileAsync('assets/boot.cmd', 'out/p/boot/boot.cmd')
  await execAsync(`mkimage -C none -A arm -T script -d out/p/boot/boot.cmd out/p/boot/boot.scr`)

  await mkdirpAsync('out/p/overlay/etc')
  await execAsync('mv out/rootfs/etc/NetworkManager out/p/overlay/etc')
  await execAsync('ln -s /mnt/persistent/overlay/etc/NetworkManager out/rootfs/etc/NetworkManager')

  await execAsync(`tar czf out/rootfs.tar.gz -C out/rootfs .`)
  console.log('rootfs.tar.gz is ready')

  await execAsync(`tar czf out/p.tar.gz -C out/p .`)
  console.log('p.tar.gz is ready')
})().then(() => {}).catch(e => console.log(e))
