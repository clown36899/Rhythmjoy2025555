export const singleEventExample = `{
  "external_id": "partner-event-20260801-1",
  "title": "토요일 린디합 강습",
  "event_dates": ["2026-08-01"],
  "category": "class",
  "genre": "린디합",
  "benefit_kind": "free_event",
  "source_url": "https://partner.example.com/events/1",
  "image_mode": "url",
  "image_url": "https://partner.example.com/images/1.webp"
}`;

export const multipleDatesExample = `{
  "external_id": "partner-class-202608",
  "title": "8월 토요일 린디합 강습",
  "event_dates": [
    "2026-08-01",
    "2026-08-08",
    "2026-08-22"
  ],
  "category": "class",
  "genre": "린디합",
  "source_url": "https://partner.example.com/classes/202608",
  "image_mode": "url",
  "image_url": "https://partner.example.com/images/class-202608.webp"
}`;

export const curlExample = `curl -X POST 'https://swingenjoy.com/api/external/v1/events' \\
  -H 'Authorization: Bearer 발급받은_API_KEY' \\
  -H 'Content-Type: application/json' \\
  --data '${singleEventExample.replace(/\n/g, '\n  ')}'`;

const nodeExample = `// Node.js 18 이상 · .mjs 또는 ESM 프로젝트
const API_KEY = process.env.DANCE_BILLBOARD_API_KEY;
if (!API_KEY) throw new Error("DANCE_BILLBOARD_API_KEY가 필요합니다.");

const response = await fetch("https://swingenjoy.com/api/external/v1/events", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${API_KEY}\`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(${singleEventExample})
});

const result = await response.json();
if (!response.ok) throw new Error(result.message || "일정 등록 실패");`;

const phpExample = `<?php
$apiKey = getenv('DANCE_BILLBOARD_API_KEY');
if (!$apiKey) throw new RuntimeException('DANCE_BILLBOARD_API_KEY가 필요합니다.');

$payload = [
  'external_id' => 'partner-event-20260801-1',
  'title' => '토요일 린디합 강습',
  'event_dates' => ['2026-08-01'],
  'category' => 'class',
  'genre' => '린디합',
  'benefit_kind' => 'free_event',
  'source_url' => 'https://partner.example.com/events/1',
  'image_mode' => 'url',
  'image_url' => 'https://partner.example.com/images/1.webp'
];

$curl = curl_init('https://swingenjoy.com/api/external/v1/events');
curl_setopt_array($curl, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    'Authorization: Bearer ' . $apiKey,
    'Content-Type: application/json'
  ],
  CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE)
]);
$body = curl_exec($curl);
if ($body === false) {
  $message = curl_error($curl);
  curl_close($curl);
  throw new RuntimeException($message);
}
$status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
curl_close($curl);
if ($status < 200 || $status >= 300) throw new RuntimeException($body);
$result = json_decode($body, true, 512, JSON_THROW_ON_ERROR);`;

const pythonExample = `import os
import requests

api_key = os.environ["DANCE_BILLBOARD_API_KEY"]
payload = ${singleEventExample.replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None')}

response = requests.post(
    "https://swingenjoy.com/api/external/v1/events",
    headers={"Authorization": f"Bearer {api_key}"},
    json=payload,
    timeout=30,
)
response.raise_for_status()
result = response.json()`;

const javaExample = `// Java 17 이상 · DanceBillboardExample.java
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;

public class DanceBillboardExample {
  public static void main(String[] args) throws Exception {
    String apiKey = System.getenv("DANCE_BILLBOARD_API_KEY");
    if (apiKey == null || apiKey.isBlank()) {
      throw new IllegalStateException("DANCE_BILLBOARD_API_KEY가 필요합니다.");
    }

    String json = """
${singleEventExample.replace(/^/gm, '      ')}
      """;

    HttpRequest request = HttpRequest.newBuilder()
        .uri(URI.create("https://swingenjoy.com/api/external/v1/events"))
        .header("Authorization", "Bearer " + apiKey)
        .header("Content-Type", "application/json")
        .POST(HttpRequest.BodyPublishers.ofString(json, StandardCharsets.UTF_8))
        .build();

    HttpResponse<String> response = HttpClient.newHttpClient()
        .send(request, HttpResponse.BodyHandlers.ofString());
    if (response.statusCode() < 200 || response.statusCode() >= 300) {
      throw new IllegalStateException(response.body());
    }
    String result = response.body();
  }
}`;

export const serverExamples = [
  { id: 'node', label: 'Node.js', note: 'Node.js 18 이상 ESM 또는 서버리스 함수', code: nodeExample },
  { id: 'php', label: 'PHP', note: 'PHP 8 이상과 cURL 확장', code: phpExample },
  { id: 'python', label: 'Python', note: 'Python 3.9 이상과 requests 패키지', code: pythonExample },
  { id: 'java', label: 'Java', note: 'Java 17 이상 단독 실행 파일', code: javaExample },
] as const;
