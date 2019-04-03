set -e

if [ -z $1 ]; then
  echo "kernel (deb) filename required"
  exit 1
elif [ ! -f $1 ]; then
  echo "file not found"
  exit 1
elif expr match $1 '^linux-image-[0-9]\+\.[0-9]\+\.[0-9]\+' > /dev/null; then
  VER=$(expr match $1 '^linux-image-[0-9]\+\.[0-9]\+\.[0-9]\+')
  VER=$(expr substr $1 1 $VER)
  VER=$(expr substr $VER 13 100)
  echo "version: $VER" 
else
  echo "invalid filename pattern, must start w/ linux-image-xx.xx.xx"
  exit
fi

# install kernel package
dpkg -i $1

# update Image
rm -rf /boot/Image
mv /boot/vmlinuz-${VER} /boot/Image.gz
gunzip /boot/Image.gz

# update uInitrd
rm -rf /boot/uInitrd
mkimage -A arm64 -O linux -T ramdisk -C gzip -n uInitrd -d /boot/initrd.img-${VER} /boot/uInitrd
rm -rf /boot/initrd.img-${VER}

# update dtb
rm -rf /boot/dtb
cp /usr/lib/linux-image-${VER}/rockchip/rk3328-evb.dtb /boot/dtb

tree /boot
