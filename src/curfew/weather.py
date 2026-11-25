"""The local weather, for the TV's screensaver: now, in words, and today's range.

From Open-Meteo (free, no account), for curfew.toml's [sky] place; asked at most
every WEATHER_SECONDS, in the background once there's an answer.
"""

import json
import urllib.parse
import urllib.request
from typing import NamedTuple

from curfew.cache import Recent
from curfew.config import LATITUDE, LONGITUDE

WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
WEATHER_SECONDS = 15 * 60

# WMO weather codes, as Open-Meteo gives them, in words.
CONDITIONS = {
    0: "Clear",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Freezing fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    56: "Freezing drizzle",
    57: "Freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Light showers",
    81: "Showers",
    82: "Heavy showers",
    85: "Snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm, hail",
    99: "Thunderstorm, hail",
}


class Weather(NamedTuple):
    """Now (°C, in words, as it feels, the WMO code, day or night) and today's range;
    and, for the screensaver's scenes, the wind (km/h, and the degrees it blows from),
    the sky's cloud (%) and the snow on the ground (m)."""

    temperature: float
    words: str
    feels: float
    high: float
    low: float
    code: int = 0
    day: bool = True
    wind: float = 0.0
    wind_from: float = 0.0
    cloud: float = 0.0
    snow_depth: float = 0.0


def scene_weather(weather: Weather | None) -> dict:
    """Return what the screensaver's scenes draw their weather from ({} without any)."""
    if weather is None:
        return {}
    return {
        "code": weather.code,
        "temp": round(weather.temperature, 1),
        "wind": round(weather.wind, 1),
        "from": round(weather.wind_from),
        "cloud": round(weather.cloud),
        "depth": round(weather.snow_depth, 3),
    }


COMPASS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")


def wind_words(weather: Weather) -> str:
    """Return the wind for the weather corner: its speed and where it's from, or calm."""
    if weather.wind < 1:
        return "calm"
    return f"wind {weather.wind:.0f} km/h {COMPASS[round(weather.wind_from / 45) % 8]}"


def weather_icon(weather: Weather) -> str:
    """Return the icon (a key of web.icons.ICONS) for the weather now."""
    code = weather.code
    if code in (0, 1):  # clear, or mainly clear
        return "light" if weather.day else "dark"  # the sun, or the moon
    if code == 2:
        return "partly" if weather.day else "cloud"
    if code in (45, 48):
        return "fog"
    if 71 <= code <= 77 or code in (85, 86):
        return "snow"
    if code >= 95:
        return "storm"
    if 51 <= code <= 82:
        return "rain"
    return "cloud"


def parse_weather(data: dict) -> Weather | None:
    """Return the weather in Open-Meteo's answer, or None if it isn't there."""
    try:
        now, today = data["current"], data["daily"]
        return Weather(
            float(now["temperature_2m"]),
            CONDITIONS.get(int(now["weather_code"]), ""),
            float(now["apparent_temperature"]),
            float(today["temperature_2m_max"][0]),
            float(today["temperature_2m_min"][0]),
            int(now["weather_code"]),
            bool(now.get("is_day", 1)),
            float(now.get("wind_speed_10m") or 0),
            float(now.get("wind_direction_10m") or 0),
            float(now.get("cloud_cover") or 0),
            float(now.get("snow_depth") or 0),
        )
    except (KeyError, IndexError, TypeError, ValueError):
        return None


def fetch_weather(latitude: float, longitude: float) -> Weather | None:
    """Ask Open-Meteo for the weather here; None if it doesn't answer sensibly."""
    query = urllib.parse.urlencode(
        {
            "latitude": latitude,
            "longitude": longitude,
            "current": "temperature_2m,apparent_temperature,weather_code,is_day,"
            "wind_speed_10m,wind_direction_10m,cloud_cover,snow_depth",
            "daily": "temperature_2m_max,temperature_2m_min",
            "timezone": "auto",
            "forecast_days": 1,
        }
    )
    try:
        with urllib.request.urlopen(f"{WEATHER_URL}?{query}", timeout=8) as response:
            return parse_weather(json.load(response))
    except (OSError, ValueError):
        return None


_weather = Recent[Weather | None](WEATHER_SECONDS, too_old=3 * 3600)


def current_weather() -> Weather | None:
    """Return the weather here (kept a while), or None without a [sky] place or an answer."""
    if LATITUDE is None or LONGITUDE is None:
        return None
    return _weather.get(lambda: fetch_weather(LATITUDE, LONGITUDE))
