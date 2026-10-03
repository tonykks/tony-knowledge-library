// YouTube Knowledge Agent - Series & Episode & Speaker Normalizer

function parseSeriesAndEpisode(title) {
  if (!title) return { series: null, episode: null };

  // 1. Bracket pattern with episode: [시리즈명 N화], [시리즈명 N회], [시리즈명 N부], [시리즈명 N강]
  // e.g., [도올의 성리학개론 4화]
  const bracketEpMatch = title.match(/\[\s*([^\]\d]+?)\s*(\d+)\s*(?:화|회|부|편|강)\s*\]/);
  if (bracketEpMatch) {
    return {
      series: bracketEpMatch[1].trim(),
      episode: parseInt(bracketEpMatch[2], 10),
    };
  }

  // 2. Bracket series without episode or special tags
  const ignoredTags = new Set(["몰아보기", "풀영상", "라이브", "공식", "단독", "요약본", "하이라이트", "특집"]);
  const bracketMatches = Array.from(title.matchAll(/\[\s*([^\]]+?)\s*\]/g));
  for (const m of bracketMatches) {
    const content = m[1].trim();
    if (ignoredTags.has(content)) continue;
    // Check if it ends with number + 화/회/부/강
    const numSub = content.match(/^(.*?)\s*(\d+)\s*(?:화|회|부|편|강)$/);
    if (numSub) {
      return { series: numSub[1].trim(), episode: parseInt(numSub[2], 10) };
    }
    return { series: content, episode: null };
  }

  // 3. Fallback: series name + number outside brackets, e.g. "세바시 2133회"
  const outsideMatch = title.match(/([가-힣a-zA-Z0-9\s]{2,}?)\s+(\d+)\s*(?:화|회|부|편|강)/);
  if (outsideMatch) {
    return {
      series: outsideMatch[1].trim(),
      episode: parseInt(outsideMatch[2], 10),
    };
  }

  return { series: null, episode: null };
}

function normalizeSpeakerName(speakers) {
  if (!speakers || speakers.length === 0) return "채널 자체 콘텐츠";
  const s = (typeof speakers === "string" ? speakers : speakers[0] || "").trim();
  if (!s) return "채널 자체 콘텐츠";
  if (s.includes("김용옥")) return "도올 김용옥";
  return s;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseSeriesAndEpisode, normalizeSpeakerName };
}
