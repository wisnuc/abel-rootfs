if test -e ${devtype} ${devnum} ${prefix}alt; then
  setenv partnum 3
  setenv rootdev "UUID=9bec42be-c362-4de0-9248-b198562ccd40"
  echo "Boot from ${devtype} ${devnum}:${partnum}"
else
  setenv partnum 2
  setenv rootdev "UUID=689b853f-3749-4055-8359-054bd6e806b4"
  echo "Boot from ${devtype} ${devnum}:${partnum}"
fi

setenv bootargs "root=${rootdev} rootwait rootfstype=ext4 console=tty0 console=ttyS2,1500000 loglevel=3"

load ${devtype} ${devnum}:${partnum} ${ramdisk_addr_r} ${prefix}uInitrd
load ${devtype} ${devnum}:${partnum} ${kernel_addr_r} ${prefix}Image
load ${devtype} ${devnum}:${partnum} ${fdt_addr_r} ${prefix}dtb
fdt addr ${fdt_addr_r}
fdt resize 65536

booti ${kernel_addr_r} ${ramdisk_addr_r} ${fdt_addr_r}

# Recompile with:
# mkimage -C none -A arm -T script -d /boot/boot.cmd /boot/boot.scr
