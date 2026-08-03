import { describe, expect, it } from "vitest";
import { getVenueDirectUrl, hasVenueWebsite } from "./venueLinks";

describe("venueLinks", () => {
  it("prefers the venue website and adds a missing protocol", () => {
    const venue = {
      name: "리듬 연습실",
      website_url: "booking.example.com/room",
      map_url: JSON.stringify({ kakao: "https://place.map.kakao.com/1" }),
    };

    expect(hasVenueWebsite(venue)).toBe(true);
    expect(getVenueDirectUrl(venue)).toBe("https://booking.example.com/room");
  });

  it("uses a stored map provider when there is no website", () => {
    expect(getVenueDirectUrl({
      map_url: JSON.stringify({ kakao: "", naver: "https://naver.me/test" }),
    })).toBe("https://naver.me/test");
  });

  it("falls back to a Kakao map search for legacy rows", () => {
    expect(getVenueDirectUrl({ address: "서울 마포구 월드컵북로 1" }))
      .toContain(encodeURIComponent("서울 마포구 월드컵북로 1"));
  });

  it("rejects unsafe URL schemes", () => {
    expect(getVenueDirectUrl({ website_url: "javascript:alert(1)" })).toBe("");
  });
});
