# Cafe24 Disaster Recovery

이 문서는 Cafe24 VPS가 통째로 사라졌을 때 새 VPS에 Swing Enjoy와 같은 VPS의 Rhythmjoy calendar 정적 앱을 되살리는 절차입니다.

## 필요한 것

1. GitHub 저장소
   - `/Users/inteyeo/Rhythmjoy2025555-5`
   - `/Users/inteyeo/Rhythmjoy_calendar`
2. 최신 로컬 백업
   - `~/RhythmjoyBackups/swingenjoy-cafe24/YYYYMMDD-HHMMSS/`
3. 새 VPS root SSH 접속
4. DNS 관리 권한

## 백업에 들어있는 것

- `swingenjoy_app.sql.gz`: DB 구조, 데이터, 트리거, 루틴, 이벤트를 포함한 MySQL 덤프
- `uploads/`: `/opt/swingenjoy/uploads` 전체 스냅샷
- `secrets/`: 운영 `.env` 파일. Git에 넣지 않는다.
- `server-config/`: systemd, Apache, certbot renewal 설정과 서버 인벤토리
- `server-runtime/opt-swingenjoy/`: Git/배포 외 서버에 남아 있던 운영 보조 파일
- `rhythmjoy-calendar/`: `/home/clown313python/myapp`, `/home/clown313python/rhythmjoy_ops`

## 새 서버 기본 준비

CentOS 계열 기준:

```bash
yum install -y httpd mariadb-server rsync gzip tar git
systemctl enable --now httpd mariadb
```

Node.js는 기존 서버 인벤토리의 버전을 맞춘다. 현재 운영은 Node 20 계열 경로를 사용한다.

## 복구 스크립트 dry-run

```bash
bash /Users/inteyeo/Rhythmjoy2025555-5/scripts/restore-cafe24-from-local.sh \
  /Users/inteyeo/RhythmjoyBackups/swingenjoy-cafe24/YYYYMMDD-HHMMSS
```

실행 전 출력된 대상 서버와 작업 목록을 확인한다.

## 실제 복구

```bash
CAFE24_SSH_TARGET=root@NEW_SERVER_IP \
CAFE24_RESTORE_MYSQL_ROOT_ARGS="-uroot" \
bash /Users/inteyeo/Rhythmjoy2025555-5/scripts/restore-cafe24-from-local.sh \
  /Users/inteyeo/RhythmjoyBackups/swingenjoy-cafe24/YYYYMMDD-HHMMSS \
  --apply
```

MySQL root에 비밀번호가 필요하면:

```bash
CAFE24_RESTORE_MYSQL_ROOT_ARGS="-uroot -p"
```

## 복구 후 점검

```bash
systemctl status swingenjoy --no-pager
systemctl status httpd --no-pager
curl -fsS http://127.0.0.1:3001/__health
httpd -t
```

DNS를 새 서버 IP로 변경한 뒤 HTTPS 인증서는 certbot으로 재발급한다.

```bash
certbot --apache -d swingenjoy.com -d www.swingenjoy.com
```

## 주의

- `secrets/`는 운영 비밀번호가 들어 있으므로 Git에 넣지 않는다.
- 로컬 백업 루트는 `chmod 700`으로 제한한다.
- 운영 DB에 덮어쓰기 전에는 가능하면 임시 DB나 새 VPS에서 먼저 복원 테스트를 한다.
