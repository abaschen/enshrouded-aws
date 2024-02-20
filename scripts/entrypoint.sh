#!/usr/bin/env bash

function enshrouded_install() {
  echo  "installing/updating enshrouded"
  steamcmd +@sSteamCmdForcePlatformType windows +force_install_dir "/home/steam/enshrouded" +login anonymous  +app_update 2278520 validate +quit
  echo "enshrouded installed"
}

function enshrouded_update() {
    enshrouded_install
}

function enshrouded_launch() {
  echo "launching enshrouded"
  enshrouded_install

  cd ~/enshrouded || exit 1

  wine64 /home/steam/enshrouded/enshrouded_server.exe
}


if [ ! -f ~/enshrouded ]; then
    mkdir -p ~/enshrouded && cd ~/enshrouded || exit 1

fi



enshrouded_launch