FROM steamcmd/steamcmd:ubuntu

ARG WINEARCH=win64
ARG WINE_MONO_VERSION=4.9.4

ENV TZ=Europe/Zurich
ENV DISPLAY=:0
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone
# Configure locale for unicode
RUN locale-gen en_US.UTF-8
ENV LANG en_US.UTF-8

# Install prerequisites
RUN apt-get update \
    && DEBIAN_FRONTEND="noninteractive" apt-get install -y --no-install-recommends \
        apt-transport-https \
        ca-certificates \
        cabextract \
        git \
        gnupg \
        gosu \
        gpg-agent \
        locales \
        p7zip \
        sudo \
        tzdata \
        unzip \
        wget \
        winbind \
        xvfb \
        zenity \
    && rm -rf /var/lib/apt/lists/*

# Install wine
ARG WINE_BRANCH="stable"
RUN wget -nv -O- https://dl.winehq.org/wine-builds/winehq.key | APT_KEY_DONT_WARN_ON_DANGEROUS_USAGE=1 apt-key add - \
    && echo "deb https://dl.winehq.org/wine-builds/ubuntu/ $(grep VERSION_CODENAME= /etc/os-release | cut -d= -f2) main" >> /etc/apt/sources.list \
    && dpkg --add-architecture i386 \
    && apt-get update \
    && DEBIAN_FRONTEND="noninteractive" apt-get install -y --install-recommends winehq-${WINE_BRANCH} \
    && rm -rf /var/lib/apt/lists/*

# Install winetricks
RUN wget -nv -O /usr/bin/winetricks https://raw.githubusercontent.com/Winetricks/winetricks/master/src/winetricks \
    && chmod +x /usr/bin/winetricks


RUN addgroup --system steam     \
    && adduser --system         \
      --home /home/steam        \
      --shell /bin/bash         \
      steam                     \
    && usermod -aG steam steam  \
    && chmod ugo+rw /tmp/dumps \
    && chown steam:steam /tmp/dumps

ENV PUID=1000
ENV PGID=1000

ENV HOME=/home/steam
ENV USER=steam
ENV LD_LIBRARY_PATH="/home/steam/.steam/sdk32:${LD_LIBRARY_PATH}"
ENV LD_LIBRARY_PATH="/home/steam/.steam/sdk64:${LD_LIBRARY_PATH}"
ENV PATH="/home/steam/.local/bin:${PATH}"

RUN usermod -u ${PUID} steam                                \
    && groupmod -g ${PGID} steam                            \
    && echo "steam ALL=(ALL) NOPASSWD: ALL" >> /etc/sudoers \
    && mkdir -p /home/steam/{.steam,enshrouded}                          \
    && cp -R /root/.local /home/steam/.local                \
    && chown -R steam:steam /home/steam/.local                \
    && chown -R steam:steam /home/steam/enshrouded \
    && ln -s $HOME/.local/share/Steam/steamcmd/linux32 $HOME/.steam/sdk32 \
    && ln -s $HOME/.local/share/Steam/steamcmd/linux64 $HOME/.steam/sdk64 \
    && ([ -f $HOME/.steam/sdk32/steamservice.so ] || ln -s $HOME/.steam/sdk32/steamclient.so $HOME/.steam/sdk32/steamservice.so) \
    && ([ -f $HOME/.steam/sdk64/steamservice.so ] || ln -s $HOME/.steam/sdk64/steamclient.so $HOME/.steam/sdk64/steamservice.so)

USER steam

WORKDIR /home/steam


# Setup a Wine prefix
ENV WINEPREFIX=/home/steam/.wine
ENV WINEARCH=${WINEARCH}
ADD https://dl.winehq.org/wine/wine-mono/${WINE_MONO_VERSION}/wine-mono-${WINE_MONO_VERSION}.msi /mono/wine-mono-${WINE_MONO_VERSION}.msi

# Install Mono
RUN winecfg \
    && wineboot -u && sudo msiexec /i /mono/wine-mono-${WINE_MONO_VERSION}.msi \
    && sudo rm -rf /mono/wine-mono-${WINE_MONO_VERSION}.msi \
    && sudo chown -R steam:steam /home/steam

COPY --chown=${PUID}:${PGID} ./scripts /home/steam/scripts
VOLUME /home/steam/enshrouded
ENV SERVER_NAME="Enshrouded Dedicated"
ENV SERVER_PASSWORD=""
ENV SERVER_SAVE_DIR="./savegame"
ENV SERVER_LOG_DIR="./logs"
ENV SERVER_MAX_SLOTS="16"
EXPOSE 15636 15637

ENTRYPOINT ["/bin/bash","/home/steam/scripts/entrypoint.sh"]
