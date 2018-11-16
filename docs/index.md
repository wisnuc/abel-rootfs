# 概述

This project generates rootfs package and disk image for project 'abel'.

# 文件系统

## 分区表与文件系统uuid

系统固定提供`p`分区，`a`/`b`分区，和`s`分区
+ `p`分区提供持久化数据存储；
    + 在abel中`p`分区也用作u-boot的启动脚本分区，对x86系统这一点不是必须的；
+ `a`/`b`分区用于系统rootfs和a/b升级模式；
+ `s`分区是swap分区，固定swap分区的文件系统uuid方便用fstab管理swap挂载；

以下为预定义的文件系统分区UUID，其中`p`, `a`, `b`均为ext4文件系统；

```js
// predefined partition uuids
module.exports = Object.freeze({
  p: '0cbc36fa-3b85-40af-946e-f15dce29d86b',
  a: '689b853f-3749-4055-8359-054bd6e806b4',
  b: '9bec42be-c362-4de0-9248-b198562ccd40',
  s: 'f0bc3049-049f-4e8e-8215-55f48add603f'
})
```
btrfs磁盘卷不做约定，挂载btrfs磁盘卷不是os层面的责任，由`winasd`自行处理。

# 挂载点

+ `p`分区的挂载点为`/mnt/persistent`
+ `a`/`b`分区之一为root文件系统，另一个挂载于`/mnt/alt`

# fstab

fstab负责挂载`p`/`a`/`b`/`s`分区，但不负责挂载btrfs数据分区；

`rootfs.tar.gz`中提供`/etc/fstab-a`和`/etc/fstab-b`两个文件，如果分区内出现了`/etc/fstab`文件则视为该分区可用。



# a/b upgrade

`ab` upgrade与平台有关。如果p分区是u-boot启动脚本分区：

1. 







