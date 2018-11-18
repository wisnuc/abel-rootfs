const Promise = require('bluebird')
const path = require('path')
const fs = Promise.promisifyAll(require('fs'))
const child = Promise.promisifyAll(require('child_process'))

const execAsync = Promise.promisify(require('./lib/exec'))
const partUUID = require('./lib/partUUID')

// let size = parseInt(fs.readFileSync(`/sys/block/${devname}/size`).toString().trim()) * 512

const fdiskInput = [
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
].join('\n')

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

;(async () => {

  await execAsync('partprobe')
  for (let i = 1; i < 7; i++) {
    try { await child.execAsync(`umount ${devpath}${i}`) } catch (e) {} 
    try { await child.execAsync(`wipefs -a ${devpath}${i}`) } catch (e) {}
  }

  await execAsync(`fdisk ${devpath}`, fdiskInput)
  await execAsync(`mkfs.ext4 -F -U ${partUUID.p} /dev/${devname}1`)
  await execAsync(`mkfs.ext4 -F -U ${partUUID.a} /dev/${devname}2`)
  await execAsync(`mkfs.ext4 -F -U ${partUUID.b} /dev/${devname}3`)
  await execAsync(`mkswap -U ${partUUID.s} /dev/${devname}5`)
  await execAsync(`mkfs.btrfs -f /dev/${devname}6`)
  await execAsync(`partprobe`)
  await execAsync('mkimage -C none -A arm -T script -d assets/boot.cmd assets/boot.scr')
  await execAsync('rm -rf mnt')
  await execAsync('mkdir -p mnt/p')
  await execAsync('mkdir -p mnt/a')

  await execAsync(`mount /dev/${devname}1 mnt/p`)
  await execAsync('tar xf out/p.tar.gz -C mnt/p')
  await execAsync('chattr +i mnt/p/boot/env-a.txt')
  await execAsync('chattr +i mnt/p/boot/env-b.txt')
  await execAsync('umount -l mnt/p')

  await execAsync(`mount /dev/${devname}2 mnt/a`)
  await execAsync(`tar xf out/rootfs.tar.gz -C mnt/a`)
  await execAsync(`cp mnt/a/etc/fstab-a mnt/a/etc/fstab`)
  await execAsync(`umount -l mnt/a`)

})().then(() => {}).catch(e => console.log(e))




