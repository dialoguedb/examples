import { createTool } from "@mastra/core/tools";
import { z } from "zod";

export const getWeather = createTool({
  id: "get_weather",
  description: "Get the current weather for a city.",
  inputSchema: z.object({
    city: z.string().describe("City name, e.g. 'Tokyo'"),
  }),
  outputSchema: z.object({
    city: z.string(),
    temperature: z.string(),
    conditions: z.string(),
  }),
  execute: async (input) => {
    const data: Record<string, { temperature: string; conditions: string }> = {
      tokyo: { temperature: "22°C", conditions: "partly cloudy" },
      london: { temperature: "14°C", conditions: "light rain" },
      "new york": { temperature: "18°C", conditions: "clear skies" },
      paris: { temperature: "16°C", conditions: "overcast" },
      sydney: { temperature: "26°C", conditions: "sunny" },
    };
    const lookup = data[input.city.toLowerCase()] ?? {
      temperature: "20°C",
      conditions: "mild",
    };
    return { city: input.city, ...lookup };
  },
});

export const convertTemperature = createTool({
  id: "convert_temperature",
  description: "Convert a temperature between Celsius and Fahrenheit.",
  inputSchema: z.object({
    value: z.number().describe("Temperature value to convert"),
    from: z.enum(["C", "F"]).describe("Source unit"),
  }),
  outputSchema: z.object({
    result: z.string(),
  }),
  execute: async (input) => {
    if (input.from === "C") {
      const f = (input.value * 9) / 5 + 32;
      return { result: `${input.value}°C = ${f.toFixed(1)}°F` };
    }
    const c = ((input.value - 32) * 5) / 9;
    return { result: `${input.value}°F = ${c.toFixed(1)}°C` };
  },
});
