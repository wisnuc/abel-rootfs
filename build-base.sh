#!/bin/bash

set -e

echo "start build"
startTime=$(date "+%s")

rm -rf rootfs
mkdir -p rootfs

echo "extracting ubuntu-base"
tar xzf assets/ubuntu-base-18.04.1-base-arm64.tar.gz -C rootfs
cp assets/linux-image-4.4.126-abel-arm64.deb rootfs
cp assets/uInitrd-4.4.126+ rootfs/boot
cp assets/sources.list rootfs/etc/apt/sources.list

mkdir -p rootfs/etc/systemd/network/
cat <<EOF > rootfs/etc/systemd/network/wired.network
[Match]
Name=en*
[Network]
DHCP=ipv4
EOF

# This is a temporary setting for chroot
cat <<EOF > rootfs/etc/resolv.conf
nameserver 192.168.31.1
EOF

# set hosts
cat <<EOF > rootfs/etc/hosts
127.0.0.1 localhost
127.0.1.1 wisnuc

# The following lines are desirable for IPv6 capable hosts
::1     localhost ip6-localhost ip6-loopback
ff02::1 ip6-allnodes
ff02::2 ip6-allrouters
EOF

# replaced by systemd-firstboot.service
# reverted
cat <<EOF > rootfs/etc/hostname
wisnuc
EOF

# chroot_setup
mount -t proc chproc rootfs/proc
mount -t sysfs chsys rootfs/sys
mount -t devtmpfs chdev rootfs/dev
mount -t devpts chpts rootfs/dev/pts

# apt update and install
chroot rootfs /bin/bash -c "apt update"
chroot rootfs /bin/bash -c "apt -y install sudo initramfs-tools openssh-server parted vim-common tzdata net-tools iputils-ping"
chroot rootfs /bin/bash -c "apt -y install avahi-daemon avahi-utils btrfs-tools udisks2 git"
chroot rootfs /bin/bash -c "apt -y install libimage-exiftool-perl imagemagick ffmpeg network-manager"
chroot rootfs /bin/bash -c "apt -y install build-essential python-minimal curl usbutils wireless-tools"
chroot rootfs /bin/bash -c "apt -y install samba rsyslog minidlna"

# add user
chroot rootfs /bin/bash -c "useradd wisnuc -b /home -m -s /bin/bash"
chroot rootfs /bin/bash -c "echo wisnuc:wisnuc | chpasswd"
chroot rootfs /bin/bash -c "adduser wisnuc sudo"

chroot rootfs /bin/bash -c "dpkg -i linux-image-4.4.126-abel-arm64.deb"

chroot rootfs /bin/bash -c "apt-mark hold linux-image-generic"
chroot rootfs /bin/bash -c "apt-mark hold linux-headers-generic"
chroot rootfs /bin/bash -c "cp -r /usr/lib/linux-image-4.4.126+ /boot/dtb-4.4.126"
chroot rootfs /bin/bash -c "ln -s dtb-4.4.126 /boot/dtb"
chroot rootfs /bin/bash -c "ln -s uInitrd-4.4.126+ /boot/uInitrd"
chroot rootfs /bin/bash -c "ln -s vmlinuz-4.4.126+ /boot/Image"

# fix sudo error
chroot rootfs /bin/bash -c "chmod 4755 /usr/bin/sudo"

# This does not work in chroot-ed environment.
# chroot rootfs /bin/bash -c "timedatectl timedatectl set-timezone Asia/Shanghai"
# see https://wiki.archlinux.org/index.php/time
# This does not work either.
# chroot rootfs /bin/bash -c "ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime"

chroot rootfs /bin/bash -c "systemctl enable systemd-networkd"
chroot rootfs /bin/bash -c "systemctl enable systemd-resolved"
chroot rootfs /bin/bash -c "systemctl disable smbd nmbd minidlna"

# update /etc/network/interfaces
cp assets/interfaces rootfs/etc/network/interfaces

chroot rootfs /bin/bash -c "apt clean"

umount -l $target/dev/pts >/dev/null 2>&1
umount -l $target/dev >/dev/null 2>&1
umount -l $target/proc >/dev/null 2>&1
umount -l $target/sys >/dev/null 2>&1

rm -rf rootfs/linux-image-4.4.126-abel-arm64.deb

# remove resolv.conf used in chroot
rm rootfs/etc/resolv.conf
# create symbolic link as systemd-resolved requires.
ln -sf /run/systemd/resolve/resolv.conf rootfs/etc/resolv.conf

# echo "creating abel-rootfs-emmc-base.tar.gz"
# tar czf abel-rootfs-emmc-base.tar.gz -C rootfs .

endTime=$(date "+%s")

echo "done in $((endTime - startTime)) seconds"
