// Current weather from Open-Meteo (no key) for a manually set city.
export type Weather = {
    temp: number;
    code: number;
    day: boolean;
    place: string;
    country?: string;
    feels?: number;
    humidity?: number;
    wind?: number;
    high?: number;
    low?: number;
    rain?: number;
    unit: "C" | "F";
};

const CACHE = "weather2";
const MAX_AGE = 15 * 60 * 1000;

type Place = { lat: number; lon: number; name: string; country?: string };

async function geocode(city: string): Promise<Place | null> {
    const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
    url.searchParams.set("name", city);
    url.searchParams.set("count", "1");
    url.searchParams.set("language", navigator.language.split("-")[0] || "en");
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const hit = (await res.json()).results?.[0];
    return hit ? { lat: hit.latitude, lon: hit.longitude, name: hit.name, country: hit.country } : null;
}


/** Last fetched weather for these settings, even if stale; for the first frame. */
export function peekWeather(city: string, fahrenheit: boolean): Weather | null {
    try {
        const cached = JSON.parse(localStorage.getItem(CACHE) ?? "null");
        return cached?.key === `${city.trim().toLowerCase()}|${fahrenheit}` ? cached.weather : null;
    } catch {
        return null;
    }
}

export async function getWeather(city: string, fahrenheit: boolean): Promise<Weather | null> {
    const key = `${city.trim().toLowerCase()}|${fahrenheit}`;
    try {
        const cached = JSON.parse(localStorage.getItem(CACHE) ?? "null");
        if (cached?.key === key && Date.now() - cached.at < MAX_AGE) return cached.weather;
    } catch {}

    try {
        if (!city.trim()) return null;
        const place = await geocode(city.trim());
        if (!place) return null;
        const url = new URL("https://api.open-meteo.com/v1/forecast");
        url.searchParams.set("latitude", String(place.lat));
        url.searchParams.set("longitude", String(place.lon));
        url.searchParams.set(
            "current",
            "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day",
        );
        url.searchParams.set(
            "daily",
            "temperature_2m_max,temperature_2m_min,precipitation_probability_max",
        );
        url.searchParams.set("forecast_days", "1");
        url.searchParams.set("timezone", "auto");
        if (fahrenheit) {
            url.searchParams.set("temperature_unit", "fahrenheit");
            url.searchParams.set("wind_speed_unit", "mph");
        }
        const data = await (await fetch(url, { signal: AbortSignal.timeout(8000) })).json();
        const { current, daily } = data;
        const round = (n: unknown) => (typeof n === "number" ? Math.round(n) : undefined);
        const weather: Weather = {
            temp: Math.round(current.temperature_2m),
            code: current.weather_code,
            day: current.is_day === 1,
            place: place.name,
            country: place.country,
            feels: round(current.apparent_temperature),
            humidity: round(current.relative_humidity_2m),
            wind: round(current.wind_speed_10m),
            high: round(daily?.temperature_2m_max?.[0]),
            low: round(daily?.temperature_2m_min?.[0]),
            rain: round(daily?.precipitation_probability_max?.[0]),
            unit: fahrenheit ? "F" : "C",
        };
        try {
            localStorage.setItem(CACHE, JSON.stringify({ key, at: Date.now(), weather }));
        } catch {}
        return weather;
    } catch {
        return null;
    }
}

/** WMO weather code → icon kind and label */
export function describe(code: number): { kind: string; label: string } {
    if (code === 0) return { kind: "clear", label: "Clear" };
    if (code <= 2) return { kind: "partly", label: "Partly cloudy" };
    if (code === 3) return { kind: "cloud", label: "Overcast" };
    if (code <= 48) return { kind: "fog", label: "Fog" };
    if (code <= 57) return { kind: "rain", label: "Drizzle" };
    if (code <= 67) return { kind: "rain", label: "Rain" };
    if (code <= 77) return { kind: "snow", label: "Snow" };
    if (code <= 82) return { kind: "rain", label: "Showers" };
    if (code <= 86) return { kind: "snow", label: "Snow showers" };
    return { kind: "storm", label: "Thunderstorm" };
}
