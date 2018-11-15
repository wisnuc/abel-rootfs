const Promise = require('bluebird')
const path = require('path')
const fs = Promise.promisifyAll(require('fs'))
const child = Promise.promisifyAll(require('child_process'))


// let size = parseInt(fs.readFileSync(`/sys/block/${devname}/size`).toString().trim()) * 512

const UUID_P = '0cbc36fa-3b85-40af-946e-f15dce29d86b'
const UUID_A = '689b853f-3749-4055-8359-054bd6e806b4'
const UUID_B = '9bec42be-c362-4de0-9248-b198562ccd40'

const fdiskCmds = [
  'o',    // create a new empty DOS partition table
  'n',    // add a new partition
  'p',    // primary
  '1',    // number 1
  '',     // first sector
  '+4G',  // last sector 
  'n',    // add a new partition
  'p',    // primary
  '2',    // number 2
  '',     // first sector
  '+6G',  // last sector
  'n',    // add a new partition
  'p',    // primary
  '3',    // number 3
  '',     // first sector
  '+6G',  // last sector
  'n',    // add a new partition
  'e',    // extended
  '4',    // number 4
  '',     // first sector
  '',     // last sector
  'n',    // new logic partition
  '',     // first sector
  '+4G',  // last sector
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

  console.log('======')
  console.log(cmd)
  console.log('======')

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

  let cmd 

  cmd = `wipefs -a ${devpath}`
  console.log(cmd)
  await child.execAsync(cmd)

  await fdiskAsync(devpath)

  await execAsync(`mkfs.ext4 -F -U ${UUID_P} /dev/${devname}1`)
  await execAsync(`mkfs.ext4 -F -U ${UUID_P} /dev/${devname}2`)
  await execAsync(`mkfs.ext4 -F -U ${UUID_P} /dev/${devname}3`)
  await execAsync(`mkswap /dev/${devname}5`)
  await execAsync(`mkfs.btrfs -f /dev/${devname}6`)
  await execAsync(`partprobe`)
  await 


})().then(() => {}).catch(e => console.log(e))




