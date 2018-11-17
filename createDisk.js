const Promise = require('bluebird')
const path = require('path')
const fs = Promise.promisifyAll(require('fs'))
const child = Promise.promisifyAll(require('child_process'))

const rimraf = require('rimraf')
const rimrafAsync = Promise.promisify(rimraf)
const mkdirp = require('mkdirp')
const mkdirpAsync = Promise.promisify(mkdirp)

const partUUID = require('./lib/partUUID')

const CCReset = '\x1b[0m'
const CCBright = '\x1b[1m'
const CCBgGreen = '\x1b[42m'
const CCFgGreen = '\x1b[32m'
/**
Reset = "\x1b[0m"
Bright = "\x1b[1m"
Dim = "\x1b[2m"
Underscore = "\x1b[4m"
Blink = "\x1b[5m"
Reverse = "\x1b[7m"
Hidden = "\x1b[8m"

FgBlack = "\x1b[30m"
FgRed = "\x1b[31m"
FgGreen = "\x1b[32m"
FgYellow = "\x1b[33m"
FgBlue = "\x1b[34m"
FgMagenta = "\x1b[35m"
FgCyan = "\x1b[36m"
FgWhite = "\x1b[37m"

BgBlack = "\x1b[40m"
BgRed = "\x1b[41m"
BgGreen = "\x1b[42m"
BgYellow = "\x1b[43m"
BgBlue = "\x1b[44m"
BgMagenta = "\x1b[45m"
BgCyan = "\x1b[46m"
BgWhite = "\x1b[47m"
*/

const cog = x => console.log(`${CCBright}${CCFgGreen}$ ${x}${CCReset}`)

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
  cog(`fdisk ${dev}`)

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
  cog(`${cmd}`)

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

  await execAsync(`wipefs -a ${devpath}`)
  await fdiskAsync(devpath)
  await execAsync(`mkfs.ext4 -F -U ${partUUID.p} /dev/${devname}1`)
  await execAsync(`mkfs.ext4 -F -U ${partUUID.a} /dev/${devname}2`)
  await execAsync(`mkfs.ext4 -F -U ${partUUID.b} /dev/${devname}3`)
  await execAsync(`mkswap -U ${partUUID.s} /dev/${devname}5`)
  await execAsync(`mkfs.btrfs -f /dev/${devname}6`)
  await execAsync(`partprobe`)

  await execAsync('mkimage -C none -A arm -T script -d assets/boot.cmd assets/boot.scr')

/**
  await rimrafAsync('mnt')
  await mkdirpAsync('mnt/p')
  await mkdirpAsync('mnt/a')
*/

  await execAsync('rm -rf mnt')
  await execAsync('mkdir -p mnt/p')
  await execAsync('mkdir -p mnt/a')

  await execAsync(`mount /dev/${devname}1 mnt/p`)
  await execAsync('tar xf out/p.tar.gz -C mnt/p')
  await execAsync('umount -l mnt/p')

/**
  await mkdirpAsync('mnt/p/boot')
  await fs.copyFileAsync('assets/boot.cmd', 'mnt/p/boot/boot.cmd')
  await fs.copyFileAsync('assets/boot.scr', 'mnt/p/boot/boot.scr')
  await fs.writeFileAsync('mnt/p/boot/armbianEnv.txt', bootenv(partUUID.a))
  await fs.writeFileAsync('mnt/p/boot/env-a.txt', bootenv(partUUID.a))
  await execAsync('chattr +i mnt/p/boot/env-a.txt')
  await fs.writeFileAsync('mnt/p/boot/env-b.txt', bootenv(partUUID.b))
  await execAsync('chattr +i mnt/p/boot/env-b.txt')
*/

  await execAsync(`mount /dev/${devname}2 mnt/a`)
  await execAsync(`tar xf out/rootfs.tar.gz -C mnt/a`)
  await execAsync(`cp mnt/a/etc/fstab-a mnt/a/etc/fstab`)
  await execAsync(`umount -l mnt/a`)

})().then(() => {}).catch(e => console.log(e))




