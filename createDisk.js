const Promise = require('bluebird')
const path = require('path')
const fs = Promise.promisifyAll(require('fs'))
const child = Promise.promisifyAll(require('child_process'))

const rimraf = require('rimraf')
const rimrafAsync = Promise.promisify(rimraf)
const mkdirp = require('mkdirp')
const mkdirpAsync = Promise.promisify(mkdirp)

const partUUID = require('./lib/partUUID')

// let size = parseInt(fs.readFileSync(`/sys/block/${devname}/size`).toString().trim()) * 512

const fdiskCmds = [
  'o',    // create a new empty DOS partition table
  'n',    // add a new partition
  'p',    // primary
  '1',    // number 1
  '',     // first sector
  '+1G',  // last sector 
  'n',    // add a new partition
  'p',    // primary
  '2',    // number 2
  '',     // first sector
  '+3G',  // last sector
  'n',    // add a new partition
  'p',    // primary
  '3',    // number 3
  '',     // first sector
  '+3G',  // last sector
  'n',    // add a new partition
  'e',    // extended
  '4',    // number 4
  '',     // first sector
  '',     // last sector
  'n',    // new logic partition
  '',     // first sector
  '+2G',  // last sector
  'n',    // new logic partition
  '',     // first sector
  '',     // last sector
  'w'     // final write
]

const fdisk = (dev, callback) => {
  console.log('======')
  console.log(`fdisk ${dev}`)
  console.log('======')

  let fd = child.spawn('fdisk',  [dev])
  fd.stdout.pipe(process.stdout)
  fd.stdin.write(fdiskCmds.join('\n'))
  fd.stdin.end()
  fd.on('exit', (code, signal) => (code || signal) 
    ? callback(new Error(`fdisk error, code ${code}, signal ${signal}`))
    : callback())
}

const fdiskAsync = Promise.promisify(fdisk)

const exec = (cmd, callback) => {
  console.log(`[[ ${cmd} ]]`)

  let split = cmd.split(' ')
    .map(x => x.trim())
    .filter(x => !!x)

  let c = child.spawn(split[0], split.slice(1), { stdio: 'inherit' })
  c.on('exit', (code, signal) => {
    if (code || signal) {
      callback(new Error('failed'))
    } else {
      callback(null)
    }
  })
}

const execAsync = Promise.promisify(exec)

const bootenv = uuid => `
verbosity=1
console=bothoverlay_prefix=rk3328
rootfstype=ext4
usbstoragequirks=0x2537:0x1066:u,0x2537:0x1068:u
partnum=2
rootdev=UUID=${uuid}
`

const fstab = (rootfsUUID, btrfsUUID, swapUUID) => `
# <file system> <mount point>   <type>  <options>   <dump>  <pass>
UUID=${rootfsUUID}  /       ext4  defaults          0   1
`

;(async () => {
  const args = process.argv.slice(2)

  if (args.length !== 1) {
    console.log('ERROR: this script requires exactly one argument')
    process.exit(1)
  } 

  let devpath = args[0]

  if (!/^\/dev\/sd[b-g]$/.test(devpath)) {
    console.log(`ERROR: invalid argument ${devpath}`)
    process.exit(1)
  }

  let devname = devpath.split('/').pop()

  let cmd 

  cmd = `wipefs -a ${devpath}`
  console.log(cmd)
  await child.execAsync(cmd)

  await fdiskAsync(devpath)
  await execAsync(`mkfs.ext4 -F -U ${partUUID.p} /dev/${devname}1`)
  await execAsync(`mkfs.ext4 -F -U ${partUUID.a} /dev/${devname}2`)
  await execAsync(`mkfs.ext4 -F -U ${partUUID.b} /dev/${devname}3`)
  await execAsync(`mkswap -U ${partUUID.s} /dev/${devname}5`)
  await execAsync(`mkfs.btrfs -f /dev/${devname}6`)
  await execAsync(`partprobe`)

  await execAsync(`mkimage -C none -A arm -T script -d assets/boot.cmd assets/boot.scr`)

  await rimrafAsync('mnt')
  await mkdirpAsync('mnt/p')
  await mkdirpAsync('mnt/a')

  console.log('preparing partition p')
  await execAsync(`mount /dev/${devname}1 mnt/p`)
  await mkdirpAsync('mnt/p/boot')
  await fs.copyFileAsync('assets/boot.cmd', 'mnt/p/boot/boot.cmd')
  await fs.copyFileAsync('assets/boot.scr', 'mnt/p/boot/boot.scr')
  await fs.writeFileAsync('mnt/p/boot/armbianEnv.txt', bootenv(partUUID.a))
  await fs.writeFileAsync('mnt/p/boot/env-a.txt', bootenv(partUUID.a))
  await execAsync('chattr +i mnt/p/boot/env-a.txt')
  await fs.writeFileAsync('mnt/p/boot/env-b.txt', bootenv(partUUID.b))
  await execAsync('chattr +i mnt/p/boot/env-b.txt')
  await execAsync('umount -l mnt/p')
  console.log('partition p is ready')

  console.log('preparing partition a')
  await execAsync(`mount /dev/${devname}2 mnt/a`)
  await execAsync(`tar xf rootfs.tar.gz -C mnt/a`)
  await execAsync(`cp mnt/a/etc/fstab-a mnt/a/etc/fstab`)
  await execAsync(`umount -l mnt/a`)
  console.log('partition a is ready')

})().then(() => {}).catch(e => console.log(e))




