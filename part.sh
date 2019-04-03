#!/bin/bash

rm -rf part.img
fallocate -l $((16#E90000 * 512)) part.img

fdisk part.img << EOF
o
n
p
1
65536
2162687
n
p
2
2162688
8716287
n
p
3
8716288
15269887
w
EOF

truncate -s $((64 * 512)) part.img

fdisk -l part.img

