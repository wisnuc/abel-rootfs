#!/bin/bash
echo 'creating partition'
target=$1
parted -s $target -- mklabel msdo
parted -s $target -- mkpart primary fat16 65535s 4259838s
parted -s $target -- mkpart primary fat16 4259839s 16842750s
parted -s $target -- mkpart primary fat16 16842751s 29425662s
parted -s $target -- mkpart extended 29425663s -1s
parted -s $target -- mkpart logical 29425665s 37814272s
parted -s $target -- mkpart logical 37814274s -1s

sync

mkfs.ext4 -F ${target}1
mkfs.ext4 -F ${target}2
mkfs.ext4 -F ${target}3
mkswap ${target}5
mkfs.btrfs -f ${target}6

sync
tune2fs ${target}1 -U 0cbc36fa-3b85-40af-946e-f15dce29d86b
tune2fs ${target}2 -U 689b853f-3749-4055-8359-054bd6e806b4
tune2fs ${target}3 -U 9bec42be-c362-4de0-9248-b198562ccd40
btrfstune -f -U 82db3f5a-d531-4bc9-8854-9431edbdd0b5 ${target}6

parted -l

sync

mkdir -p /tmp/partP /tmp/partA
mount ${target}1 /tmp/partP
mount ${target}2 /tmp/partA

echo 'copy boot script to partP'
cp -r ./assets/boot /tmp/partP/

echo "rootdev=UUID=$(blkid -s UUID -o value ${target}2)" >> /tmp/partP/boot/envA.txt
echo "rootdev=UUID=$(blkid -s UUID -o value ${target}3)" >> /tmp/partP/boot/envB.txt

echo 'extract rootfs to partA'
tar -xf ./output/abel-rootfs-emmc-base.tar.gz -C /tmp/partA/

echo 'install nodejs'
tar -xf ./assets/node-v8.10.0-linux-arm64.tar.gz -C /tmp/partA/usr/local/
mv /tmp/partA/usr/local/node-v8.10.0-linux-arm64 /tmp/partA/usr/local/node
ln -s /usr/local/node/bin/node /tmp/partA/usr/local/bin/node
ln -s /usr/local/node/bin/npm /tmp/partA/usr/local/bin/npm
ln -s /usr/local/node/bin/npx /tmp/partA/usr/local/bin/npx

echo 'setting up winas'
cp ./assets/version /tmp/partA/etc/version
cp ./assets/device /tmp/partA/etc/device
cp ./assets/ble.bin /tmp/partA/

echo 'create fstab'
echo "UUID=$(blkid -s UUID -o value ${target}2) / ext4 defaults,noatime,nodiratime,commit=600,errors=remount-ro 0 1" >> /tmp/partA/etc/fstab
echo "UUID=$(blkid -s UUID -o value ${target}5) none swap sw 0 0" >> /tmp/partA/etc/fstab
echo "tmpfs /tmp tmpfs defaults,nosuid 0 0" >> /tmp/partA/etc/fstab

echo 'sync...'
sync

umount /tmp/partP
umount /tmp/partA

echo 'done!'
