import { describe, expect, it } from "vitest";
import { streamedRenderProblem } from "../src/lib/deploy-health";

describe("deployment response health", () => {
  it("accepts ordinary HTML", () => {
    expect(streamedRenderProblem("<!doctype html><h1>Peter R. Adam</h1>")).toBeNull();
  });

  it("detects a React Flight render error after an HTTP 200 shell", () => {
    const response = String.raw`<script>self.__next_f.push([1,"1e:E{\"digest\":\"3723604918\"}"])</script>`;
    expect(streamedRenderProblem(response)).toBe("contains a streamed server-rendering error");
  });

  it("detects an unescaped Flight error record", () => {
    expect(streamedRenderProblem('1e:E{"digest":"3723604918"}')).not.toBeNull();
  });
});
