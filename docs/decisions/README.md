# Decision Records

이 폴더는 장기적으로 되돌아보기 어려운 프로젝트 결정을 기록한다.

## 언제 남기는가

- 아키텍처나 데이터 소유권이 바뀔 때
- 배포, 운영, 백업, 보안 정책이 바뀔 때
- 자동화가 운영 데이터를 읽거나 쓰는 경계가 바뀔 때
- 나중에 "왜 이렇게 했는가"를 다시 물을 가능성이 큰 결정일 때

## 파일 이름

```text
YYYY-MM-DD-short-title.md
```

## 템플릿

```md
# 제목

- 날짜:
- 상태: proposed | accepted | superseded

## Context

## Decision

## Consequences

## Related
```
