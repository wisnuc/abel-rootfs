This project is under development.

This document is for project developer.

# 1. Overview

This project builds ssd/mmc image for winas hardware.

# 2. Dependency

- u-boot binary, from github.com/wisnuc/rock64-uboot
- kernel binary, from github.com/wisnuc/rockchip-kernel
- node.js, from nodejs.org
- ffmpeg static, from 

# 3. Hardware

winas hardware is based on Rockchip RK33xx family SoCs. 

A winas board may have:

1. mmc card slot only (Church)
2. spi flash and usb/sata drive, but no mmc card slot (Backus)
3. spi flash, usb/sata drive, and mmc card slot (Abel)

If spi flash is present, the board always boot from spi flash. Then the bootloader scans mmc and usb sata drive to load boot script.

If spi flash is not present, the board boot from mmc card.

# 4. Scripts

`install.sh`

install qemu and binfmt support for aarch64 chroot.

# 5. Partitions

For either SSD or MMC, the MSDOS partition table is used.


