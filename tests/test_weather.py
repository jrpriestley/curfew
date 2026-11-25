"""The local weather: Open-Meteo's answer, read."""

from curfew.weather import Weather, parse_weather, scene_weather, weather_icon, wind_words

ANSWER = {
    "current": {
        "temperature_2m": 4.2,
        "apparent_temperature": 1.4,
        "weather_code": 61,
        "is_day": 0,
    },
    "daily": {"temperature_2m_max": [6.0], "temperature_2m_min": [0.6]},
}


def test_the_answer_becomes_now_in_words_and_todays_range() -> None:
    """Temperatures as given; the WMO code in words (unknown codes say nothing)."""
    assert parse_weather(ANSWER) == Weather(4.2, "Light rain", 1.4, 6.0, 0.6, 61, False)
    odd = {**ANSWER, "current": {**ANSWER["current"], "weather_code": 42}}
    assert parse_weather(odd).words == ""


def test_the_scenes_get_the_wind_cloud_and_snow() -> None:
    """Wind, cloud and snow on the ground ride along for the screensaver; missing, none."""
    full = {
        **ANSWER,
        "current": {
            **ANSWER["current"],
            "weather_code": 73,
            "wind_speed_10m": 21.4,
            "wind_direction_10m": 270,
            "cloud_cover": 100,
            "snow_depth": 0.04,
        },
    }
    weather = parse_weather(full)
    assert (weather.wind, weather.wind_from, weather.cloud, weather.snow_depth) == (
        21.4,
        270,
        100,
        0.04,
    )
    assert scene_weather(weather) == {
        "code": 73,
        "temp": 4.2,
        "wind": 21.4,
        "from": 270,
        "cloud": 100,
        "depth": 0.04,
    }
    assert parse_weather(ANSWER).wind == 0 and scene_weather(None) == {}


def test_the_wind_is_its_speed_and_where_its_from() -> None:
    """The weather corner's wind: km/h and a compass point; under 1 km/h, calm."""
    weather = parse_weather(ANSWER)
    assert wind_words(weather._replace(wind=21.4, wind_from=290)) == "wind 21 km/h W"
    assert wind_words(weather._replace(wind=8, wind_from=350)) == "wind 8 km/h N"
    assert wind_words(weather._replace(wind=0.4)) == "calm"


def test_an_answer_without_the_weather_is_none() -> None:
    """A changed or broken answer shows no weather rather than failing the page."""
    assert parse_weather({}) is None
    assert parse_weather({"current": {}, "daily": {}}) is None
    assert (
        parse_weather({**ANSWER, "daily": {"temperature_2m_max": [], "temperature_2m_min": []}})
        is None
    )


def test_the_icon_follows_the_sky_and_the_hour() -> None:
    """Clear is the sun by day and the moon by night; the rest by what falls, or doesn't."""
    sky = Weather(1.0, "", 1.0, 2.0, 0.0)
    expected = {
        (0, True): "light",
        (0, False): "dark",
        (2, True): "partly",
        (2, False): "cloud",
        (3, True): "cloud",
        (45, True): "fog",
        (61, True): "rain",
        (81, False): "rain",
        (73, True): "snow",
        (86, True): "snow",
        (95, True): "storm",
    }
    for (code, day), name in expected.items():
        assert weather_icon(sky._replace(code=code, day=day)) == name, (code, day)
