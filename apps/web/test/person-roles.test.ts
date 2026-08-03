import { describe, expect, it } from "vitest";
import { leadRole, rankedRoles } from "@/lib/person-roles";

/**
 * The six crew labels this has to bridge are the only six in the database:
 * Director, Screenplay, Producer, Original Music Composer, Director of
 * Photography, Editor — plus cast credits. Both directions of the naive
 * string-similarity version are pinned here as regressions.
 */
describe("rankedRoles", () => {
  it("leads with the job our own credits support, not Wikidata's order", () => {
    // Wikidata's order for Destin Daniel Cretton put screenwriter first.
    const roles = rankedRoles({
      occupations: ["film screenwriter", "film editor", "film director"],
      castCredits: 0,
      crewJobs: ["Director", "Director", "Director", "Screenplay", "Editor"],
    });
    expect(roles[0]).toBe("film director");
  });

  it("does not call a cinematographer a director", () => {
    // "Director of Photography" contains the word "director": the collision that
    // matters, because so many of these pages are cinematographers.
    const roles = rankedRoles({
      occupations: ["film director", "cinematographer"],
      castCredits: 0,
      crewJobs: Array.from({ length: 18 }, () => "Director of Photography"),
    });
    expect(roles[0]).toBe("cinematographer");
  });

  it("matches Screenplay to screenwriter, which share no word", () => {
    const roles = rankedRoles({
      occupations: ["film producer", "screenwriter"],
      castCredits: 0,
      crewJobs: ["Screenplay", "Screenplay", "Screenplay"],
    });
    expect(roles[0]).toBe("screenwriter");
  });

  it("matches Original Music Composer to composer", () => {
    const roles = rankedRoles({
      occupations: ["conductor", "composer"],
      castCredits: 0,
      crewJobs: ["Original Music Composer", "Original Music Composer"],
    });
    expect(roles[0]).toBe("composer");
  });

  it("counts cast credits as acting", () => {
    const roles = rankedRoles({
      occupations: ["film producer", "film actor"],
      castCredits: 12,
      crewJobs: ["Producer"],
    });
    expect(roles[0]).toBe("film actor");
  });

  it("keeps Wikidata's order when our credits say nothing", () => {
    expect(
      rankedRoles({ occupations: ["stage actor", "novelist"], castCredits: 0, crewJobs: [] }),
    ).toEqual(["stage actor", "novelist"]);
  });

  it("appends a job Wikidata omitted rather than losing it", () => {
    const roles = rankedRoles({
      occupations: ["film producer"],
      castCredits: 0,
      crewJobs: Array.from({ length: 40 }, () => "Director of Photography"),
    });
    // Unevidenced occupation stays, but the real job leads.
    expect(roles[0]).toBe("Director of Photography");
    expect(roles).toContain("film producer");
  });

  it("titles the appended cast label rather than shouting it lowercase", () => {
    const roles = rankedRoles({ occupations: [], castCredits: 5, crewJobs: [] });
    expect(roles).toEqual(["Actor"]);
  });

  it("has nothing to say about a person with no roles at all", () => {
    expect(rankedRoles({ occupations: [], castCredits: 0, crewJobs: [] })).toEqual([]);
    expect(leadRole({ occupations: [], castCredits: 0, crewJobs: [] })).toBeNull();
  });
});
