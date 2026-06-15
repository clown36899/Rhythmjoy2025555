# Cafe24 Local Backup

Cafe24 운영 서버를 이 Mac으로 내려받는 로컬 백업 절차입니다. 목표는 Cafe24 VPS가 통째로 사라져도 새 VPS에서 복구할 수 있는 재료를 남기는 것입니다.

## 백업 대상

- MySQL 데이터베이스: `swingenjoy_app`
- 업로드 파일: `/opt/swingenjoy/uploads`
- Swing Enjoy 서버 런타임 보조 파일: `/opt/swingenjoy` 중 Git/빌드/업로드/백업/비밀값 제외분
- Rhythmjoy calendar 정적 앱: `/home/clown313python/myapp`
- Rhythmjoy calendar ops: `/home/clown313python/rhythmjoy_ops`
- 서버 설정 스냅샷: systemd, Apache, certbot renewal, cron, 서버 인벤토리
- 운영 비밀값: `secrets/` 안의 `.env` 사본
- 진단 파일: `manifest.txt`, `mysql-table-sizes.tsv`, `mysql-current-user-grants.sql`, `SHA256SUMS`

`secrets/`에는 운영 비밀번호가 들어 있으므로 Git에 넣지 않습니다. 로컬 백업 루트는 사용자만 접근하도록 `chmod 700`으로 제한합니다.

## 로컬 저장 위치

```text
~/RhythmjoyBackups/swingenjoy-cafe24/YYYYMMDD-HHMMSS/
```

기본 보관 개수는 최근 30회입니다.

## 백업 방식

- DB는 매번 전체 덤프를 저장합니다. 현재 DB가 작아서 이 방식이 가장 단순하고 복구 누락 가능성이 낮습니다.
- 업로드 파일은 첫 실행 때 전체 스냅샷을 만들고, 다음 실행부터는 직전 스냅샷을 기준으로 `rsync --link-dest` 증분 스냅샷을 만듭니다.
- Rhythmjoy calendar와 서버 런타임 보조 파일도 같은 방식으로 증분 스냅샷을 만듭니다.
- 각 회차의 폴더는 그 시점의 전체 파일처럼 열어볼 수 있습니다. 단, 변경되지 않은 파일은 이전 백업과 하드링크로 공유되어 로컬 디스크를 중복 사용하지 않습니다.
- 이전 백업이 아직 실행 중이면 새 실행은 건너뜁니다.

## 수동 실행

```bash
bash /Users/inteyeo/Rhythmjoy2025555-5/scripts/backup-cafe24-to-local.sh
```

## 자동 실행

macOS LaunchAgent 파일:

```text
~/Library/LaunchAgents/com.rhythmjoy.cafe24-local-backup.plist
```

기본 스케줄은 매일 04:30입니다. 첫 실행은 전체 업로드 스냅샷이고, 이후 실행은 변경분 중심의 증분 스냅샷입니다.

## 복구

복구 절차는 `docs/cafe24-disaster-recovery.md`와 `scripts/restore-cafe24-from-local.sh`를 사용합니다.
