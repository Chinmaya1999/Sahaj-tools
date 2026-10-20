#!/usr/bin/env bash
# One-time (idempotent) setup of a fresh Amazon Linux 2023 EC2 host. Run as root: sudo bash bootstrap-server.sh
set -euo pipefail
COMPOSE_VERSION="v2.32.4"

echo ">> system updates + docker"
dnf -y -q update --security || true
dnf -y -q install docker git curl-minimal dnf-automatic
systemctl enable --now docker
usermod -aG docker ec2-user

echo ">> docker compose plugin ${COMPOSE_VERSION} (checksum verified)"
mkdir -p /usr/local/lib/docker/cli-plugins
if ! docker compose version 2>/dev/null | grep -q "${COMPOSE_VERSION#v}"; then
  base="https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}"
  curl -fsSL "$base/docker-compose-linux-x86_64" -o /tmp/docker-compose
  curl -fsSL "$base/docker-compose-linux-x86_64.sha256" -o /tmp/docker-compose.sha256
  (cd /tmp && echo "$(cut -d' ' -f1 docker-compose.sha256)  docker-compose" | sha256sum -c -)
  install -m 0755 /tmp/docker-compose /usr/local/lib/docker/cli-plugins/docker-compose
  rm -f /tmp/docker-compose /tmp/docker-compose.sha256
fi

echo ">> docker daemon: log rotation, no new privileges across containers"
cat > /etc/docker/daemon.json <<'JSON'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "3" }, "live-restore": true, "no-new-privileges": true }
JSON
systemctl restart docker

echo ">> swap (the instance has under 1 GB of RAM)"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
sysctl -w vm.swappiness=20 >/dev/null; echo 'vm.swappiness=20' > /etc/sysctl.d/99-swap.conf

echo ">> automatic security updates"
sed -i 's/^apply_updates.*/apply_updates = yes/; s/^upgrade_type.*/upgrade_type = security/' /etc/dnf/automatic.conf
systemctl enable --now dnf-automatic.timer

echo ">> ssh hardening (key-only, no root)"
cat > /etc/ssh/sshd_config.d/99-hardening.conf <<'SSH'
PasswordAuthentication no
PermitRootLogin no
KbdInteractiveAuthentication no
MaxAuthTries 3
LoginGraceTime 20
X11Forwarding no
SSH
sshd -t && systemctl reload sshd

echo ">> app directory"
install -d -o ec2-user -g ec2-user -m 750 /opt/sahaj
echo ">> done"
docker --version; docker compose version
