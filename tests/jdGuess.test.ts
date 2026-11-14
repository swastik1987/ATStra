import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { guessRoleAndCompany } from "../src/lib/jdGuess.ts";

describe("guessRoleAndCompany", () => {
  it("reads labelled fields", () => {
    expect(guessRoleAndCompany("Job title: Data Engineer\nCompany: Contoso Ltd\n\nWe are...")).toEqual({ role: "Data Engineer", company: "Contoso Ltd" });
    expect(guessRoleAndCompany("Position - Product Manager\nEmployer: Fabrikam")).toEqual({ role: "Product Manager", company: "Fabrikam" });
  });

  it("reads 'Role at Company' and 'About Company' patterns", () => {
    expect(guessRoleAndCompany("Senior Data Analyst at Tailwind Freight\nLeeds")).toEqual({ role: "Senior Data Analyst", company: "Tailwind Freight" });
    expect(guessRoleAndCompany("Backend Engineer\n\nAbout Northwind\nNorthwind builds...")).toEqual({ role: "Backend Engineer", company: "Northwind" });
  });

  it("handles the fixture posting", () => {
    const jd = readFileSync("tests/fixtures/jd-senior-data-analyst.txt", "utf8");
    expect(guessRoleAndCompany(jd)).toEqual({ role: "Senior Data Analyst", company: "Tailwind Freight" });
  });

  it("returns empty strings rather than guessing from prose", () => {
    expect(guessRoleAndCompany("We are a fast-growing company looking for someone who loves data and wants to make an impact on our team.")).toEqual({ role: "", company: "" });
  });
});
