#!/bin/bash

cat <<EOF > /etc/apt/sources.list
deb http://cn.archive.ubuntu.com/ubuntu bionic main
deb http://security.ubuntu.com/ubuntu bionic-security main
deb http://cn.archive.ubuntu.com/ubuntu bionic-updates main
deb http://cn.archive.ubuntu.com/ubuntu/ bionic universe
deb http://security.ubuntu.com/ubuntu bionic-security universe
deb http://cn.archive.ubuntu.com/ubuntu/ bionic-updates universe
EOF

apt update
apt upgrade
apt install qemu-user-static binfmt-support

# apt install build-essential qemu-user-static binfmt-support gcc-aarch64-linux-gnu
# update-binfmts --enable qemu-aarch64



