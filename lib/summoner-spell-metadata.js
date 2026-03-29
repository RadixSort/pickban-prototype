"use strict";

const SUMMONER_SPELL_ICON_BASE_URL =
  "https://raw.communitydragon.org/latest/game/data/spells/icons2d";

const SUMMONER_SPELL_ICON_FILE_BY_ID = new Map([
  [1, "summoner_boost.png"],
  [3, "summoner_exhaust.png"],
  [4, "summoner_flash.png"],
  [6, "summoner_haste.png"],
  [7, "summoner_heal.png"],
  [11, "summoner_smite.png"],
  [12, "summoner_teleport_new.png"],
  [13, "summonermana.png"],
  [14, "summonerignite.png"],
  [21, "summonerbarrier.png"],
  [30, "benevolence_of_king_poro_icon.png"],
  [31, "trailblazer_poro_icon.png"],
  [32, "summoner_mark.png"],
  [39, "summoner_mark.png"],
  [54, "summoner_empty.png"],
  [55, "summoner_emptysmite.png"],
]);

function buildSummonerSpellIconUrl(value) {
  const spellId = normalizeNumericId(value);
  if (spellId == null) {
    return "";
  }

  const iconFileName = SUMMONER_SPELL_ICON_FILE_BY_ID.get(spellId);
  return iconFileName ? `${SUMMONER_SPELL_ICON_BASE_URL}/${iconFileName}` : "";
}

function normalizeNumericId(value) {
  const numericValue = Number(value);
  return Number.isInteger(numericValue) ? numericValue : null;
}

module.exports = {
  buildSummonerSpellIconUrl,
};
