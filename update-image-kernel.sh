# assuming $1 is kernel file name

# remove temp mount point
# rm -rf mnta

set -e

TMP_MNT=mnta
IMG_FILE=a.img

if [ -z $1 ]; then
  echo "kernel (deb) filename required"
  exit
elif [ ! -f $1 ]; then 
  echo "file not found"
  exit
fi

if mount | grep -q ${TMP_MNT}; then
  echo "${TMP_MNT} mounted"
else
  echo "${TMP_MNT} not mounted"
  mkdir -p ${TMP_MNT}
  mount -o loop ${IMG_FILE} ${TMP_MNT}
fi

# copy file to chroot /
cp $1 ${TMP_MNT}
# copy qemu
cp /usr/bin/qemu-aarch64-static ${TMP_MNT}/usr/bin/qemu-aarch64-static
# copy script
cp update-kernel.sh ${TMP_MNT}/update-kernel.sh
chmod a+x ${TMP_MNT}/update-kernel.sh

echo "chroot setup"
mount -t  proc      chproc    ${TMP_MNT}/proc
mount -t  sysfs     chsys     ${TMP_MNT}/sys 
mount -t  devtmpfs  chdev     ${TMP_MNT}/dev 
mount -t  devpts    chpts     ${TMP_MNT}/dev/pts

{
  chroot ${TMP_MNT} /update-kernel.sh $1
} || {
  echo "failed"
}

echo "chroot teardown"
umount -l ${TMP_MNT}/dev/pts
umount -l ${TMP_MNT}/dev
umount -l ${TMP_MNT}/sys
umount -l ${TMP_MNT}/proc

rm -rf ${TMP_MNT}/$1

echo "done"
