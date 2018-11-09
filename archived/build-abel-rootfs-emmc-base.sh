#!/bin/bash

set -e

echo "start build"
startTime=$(date "+%s")

TARGET=target/emmc
OUTPUT=output

rm -rf ${TARGET}
mkdir -p ${TARGET}
mkdir -p ${OUTPUT}

echo "extracting ubuntu-base"
tar xzf assets/ubuntu-base-18.04.1-base-arm64.tar.gz -C ${TARGET}
cp assets/linux-image-4.4.126-abel-arm64.deb ${TARGET}
cp assets/uInitrd-4.4.126+ ${TARGET}/boot
cp assets/sources.list ${TARGET}/etc/apt/sources.list

mkdir -p ${TARGET}/etc/systemd/network/
cat <<EOF > ${TARGET}/etc/systemd/network/wired.network
[Match]
Name=en*
[Network]
DHCP=ipv4
EOF

# This is a temporary setting for chroot
cat <<EOF > ${TARGET}/etc/resolv.conf
nameserver 192.168.31.1
EOF

cat <<EOF > ${TARGET}/etc/hosts
127.0.0.1 localhost
127.0.1.1 wisnuc

# The following lines are desirable for IPv6 capable hosts
::1     localhost ip6-localhost ip6-loopback
ff02::1 ip6-allnodes
ff02::2 ip6-allrouters
EOF

# replaced by systemd-firstboot.service
# reverted
cat <<EOF > ${TARGET}/etc/hostname
wisnuc
EOF

# mount_chroot <target>
mount_chroot()
{
  local target=$1
  mount -t proc chproc $target/proc
  mount -t sysfs chsys $target/sys
  mount -t devtmpfs chdev $target/dev || mount --bind /dev $target/dev
  mount -t devpts chpts $target/dev/pts
} 

# umount_chroot <target>
umount_chroot()
{
  local target=$1
  umount -l $target/dev/pts >/dev/null 2>&1
  umount -l $target/dev >/dev/null 2>&1
  umount -l $target/proc >/dev/null 2>&1
  umount -l $target/sys >/dev/null 2>&1
}

# chroot_setup
mount_chroot ${TARGET}

# apt update and install
chroot ${TARGET} /bin/bash -c "apt update"
chroot ${TARGET} /bin/bash -c "apt -y install sudo initramfs-tools openssh-server parted vim-common tzdata net-tools iputils-ping"
chroot ${TARGET} /bin/bash -c "apt -y install avahi-daemon avahi-utils btrfs-tools udisks2 git"
chroot ${TARGET} /bin/bash -c "apt -y install libimage-exiftool-perl imagemagick ffmpeg network-manager"
chroot ${TARGET} /bin/bash -c "apt -y install build-essential python-minimal curl usbutils wireless-tools"
chroot ${TARGET} /bin/bash -c "apt -y install samba rsyslog minidlna"

# add user
chroot ${TARGET} /bin/bash -c "useradd wisnuc -b /home -m -s /bin/bash"
chroot ${TARGET} /bin/bash -c "echo wisnuc:wisnuc | chpasswd"
chroot ${TARGET} /bin/bash -c "adduser wisnuc sudo"

chroot ${TARGET} /bin/bash -c "dpkg -i linux-image-4.4.126-abel-arm64.deb"

chroot ${TARGET} /bin/bash -c "apt-mark hold linux-image-generic"
chroot ${TARGET} /bin/bash -c "apt-mark hold linux-headers-generic"
chroot ${TARGET} /bin/bash -c "cp -r /usr/lib/linux-image-4.4.126+ /boot/dtb-4.4.126"
chroot ${TARGET} /bin/bash -c "ln -s dtb-4.4.126 /boot/dtb"
chroot ${TARGET} /bin/bash -c "ln -s uInitrd-4.4.126+ /boot/uInitrd"
chroot ${TARGET} /bin/bash -c "ln -s vmlinuz-4.4.126+ /boot/Image"

# fix sudo error
chroot ${TARGET} /bin/bash -c "chmod 4755 /usr/bin/sudo"

# This does not work in chroot-ed environment.
# chroot ${TARGET} /bin/bash -c "timedatectl timedatectl set-timezone Asia/Shanghai"
# see https://wiki.archlinux.org/index.php/time
# This does not work either.
# chroot ${TARGET} /bin/bash -c "ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime"

chroot ${TARGET} /bin/bash -c "systemctl enable systemd-networkd"
chroot ${TARGET} /bin/bash -c "systemctl enable systemd-resolved"
chroot ${TARGET} /bin/bash -c "systemctl disable smbd nmbd minidlna"

# update /etc/network/interfaces
cp assets/interfaces ${TARGET}/etc/network/interfaces

# echo "/dev/mmcblk0p1 / ext4 errors=remount-ro 0 1" > ${TARGET}/etc/fstab

chroot ${TARGET} /bin/bash -c "apt clean"

umount_chroot ${TARGET}

rm -rf ${TARGET}/linux-image-4.4.126-abel-arm64.deb

# remove resolv.conf used in chroot
rm ${TARGET}/etc/resolv.conf
# create symbolic link as systemd-resolved requires.
ln -sf /run/systemd/resolve/resolv.conf ${TARGET}/etc/resolv.conf

echo "creating abel-rootfs-emmc-base.tar.gz"
tar czf ${OUTPUT}/abel-rootfs-emmc-base.tar.gz -C ${TARGET} .

endTime=$(date "+%s")

echo "done in $((endTime - startTime)) seconds"
