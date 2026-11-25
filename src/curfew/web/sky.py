"""The top bar's sky and the moon logo, both following homehub's clock."""

import datetime as dt
import html
import math

from curfew.config import LATITUDE, LONGITUDE
from curfew.schedules import aware, local_now, schedule_active

SYNODIC_DAYS = 29.530588853  # mean new moon to new moon


NEW_MOON_EPOCH = dt.datetime(2000, 1, 6, 18, 14, tzinfo=dt.UTC)  # a known new moon


MOON_NAMES = (
    (0.0339, "New moon"),
    (0.2161, "Waxing crescent"),
    (0.2839, "First quarter"),
    (0.4661, "Waxing gibbous"),
    (0.5339, "Full moon"),
    (0.7161, "Waning gibbous"),
    (0.7839, "Last quarter"),
    (0.9661, "Waning crescent"),
    (1.0, "New moon"),
)


def moon_phase(now: dt.datetime) -> float:
    """Return the moon's age as a fraction of its cycle: 0 new, 0.5 full.

    The mean synodic month from a known new moon; good to within a day or
    so, which is plenty for a logo.
    """
    days = (aware(now) - NEW_MOON_EPOCH).total_seconds() / 86400
    return (days / SYNODIC_DAYS) % 1


def moon_name(phase: float) -> str:
    """Return the phase's everyday name and how much of the disc is lit."""
    lit = round((1 - math.cos(2 * math.pi * phase)) / 2 * 100)
    name = next(label for limit, label in MOON_NAMES if phase < limit)
    return f"{name}, {lit}% lit"


def logo_svg(now: dt.datetime) -> str:
    """Return the logo: tonight's moon, lit side and all, in greys.

    The lit part is the half-disc on the sunward side (right while waxing,
    left while waning) closed by the terminator, an ellipse whose width is
    |cos(phase angle)| of the radius: it bulges into the lit half for a
    crescent and away from it for a gibbous moon.
    """
    phase = moon_phase(now)
    angle = 2 * math.pi * phase
    radius, centre = 7.0, 12.0
    top, bottom = f"{centre},{centre - radius}", f"{centre},{centre + radius}"
    terminator = abs(math.cos(angle)) * radius
    waxing = phase < 0.5
    crescent = math.cos(angle) > 0
    limb_sweep = 1 if waxing else 0
    term_sweep = (0 if crescent else 1) if waxing else (1 if crescent else 0)
    lit = (
        f'<path class="logo-lit" d="M{top} A{radius},{radius} 0 0 {limb_sweep} {bottom} '
        f'A{terminator:.2f},{radius} 0 0 {term_sweep} {top} Z"/>'
    )
    title = html.escape(moon_name(phase))
    return (
        f'<svg class="logo" viewBox="0 0 24 24" role="img" aria-label="{title}">'
        f"<title>{title}</title>"
        '<rect class="logo-bg" width="24" height="24" rx="6"/>'
        f'<circle class="logo-dark" cx="{centre}" cy="{centre}" r="{radius}"/>{lit}</svg>'
    )


def moon_svg(now: dt.datetime) -> str:
    """Return tonight's moon alone, lit side and all (the logo's, without its tile)."""
    logo = logo_svg(now)
    return logo.replace('<rect class="logo-bg" width="24" height="24" rx="6"/>', "").replace(
        'class="logo"', 'class="moon"', 1
    )


def sun_times(day: dt.date, latitude: float, longitude: float) -> tuple[float, float] | None:
    """Return sunrise and sunset on ``day`` as Unix times; None while the sun stays up or down.

    The sunrise equation (the sun's centre 0.833 degrees below the horizon,
    for refraction and its radius); within a minute or two, plenty for a sky.
    """
    days = (day - dt.date(2000, 1, 1)).days - longitude / 360  # mean solar noon, from J2000
    anomaly = math.radians((357.5291 + 0.98560028 * days) % 360)
    centre = (
        1.9148 * math.sin(anomaly) + 0.02 * math.sin(2 * anomaly) + 0.0003 * math.sin(3 * anomaly)
    )
    ecliptic = math.radians((math.degrees(anomaly) + centre + 180 + 102.9372) % 360)
    noon = 2451545.0 + days + 0.0053 * math.sin(anomaly) - 0.0069 * math.sin(2 * ecliptic)
    declination = math.asin(math.sin(ecliptic) * math.sin(math.radians(23.4397)))
    latitude = math.radians(latitude)
    hour_angle = (math.sin(math.radians(-0.833)) - math.sin(latitude) * math.sin(declination)) / (
        math.cos(latitude) * math.cos(declination)
    )
    if abs(hour_angle) > 1:
        return None
    half_day = math.degrees(math.acos(hour_angle)) / 360
    return tuple((julian - 2440587.5) * 86400 for julian in (noon - half_day, noon + half_day))


TWILIGHT = 30 * 60  # dawn starts, and night falls, this long before sunrise / after sunset
GOLDEN = 60 * 60  # dawn lasts, and dusk starts, this long after sunrise / before sunset
# Without a location (or near the poles), the sky goes by fixed hours instead.
FIXED_HOURS = (5, 8, 17, 21)


def sky_hours(day: dt.date, tz: dt.tzinfo | None) -> tuple[float, ...]:
    """Return when dawn, day, dusk and night start on ``day``, in local hours (7.5 is 07:30)."""
    sun = sun_times(day, LATITUDE, LONGITUDE) if LATITUDE is not None else None
    if sun is None or LONGITUDE is None:
        return FIXED_HOURS
    rise, down = sun
    midnight = dt.datetime.combine(day, dt.time(), tz).timestamp()
    moments = (rise - TWILIGHT, rise + GOLDEN, down - GOLDEN, down + TWILIGHT)
    return tuple((moment - midnight) / 3600 for moment in moments)


def sky_phase(state: dict, now: dt.datetime) -> tuple[str, str]:
    """Return the top bar's sky (dawn, day, dusk or night) and a sentence on why.

    The sky follows the sun at homehub. A curfew brings night early: in the
    evening, if any schedule is blocking, it's night whatever the sun says;
    in the morning the sun wins (the curfew is named, not drawn).
    """
    local = aware(now).astimezone()
    curfews = sorted(
        profile["name"]
        for profile in state["profiles"].values()
        if any(schedule_active(schedule, local) for schedule in profile.get("schedules", []))
    )
    if curfews and local.hour >= 12:
        return "night", f"Night: curfew for {', '.join(curfews)}"
    hour = local.hour + local.minute / 60
    dawn, day, dusk, night = sky_hours(local.date(), local.tzinfo)
    phase = (
        "dawn"
        if dawn <= hour < day
        else "day"
        if day <= hour < dusk
        else ("dusk" if dusk <= hour < night else "night")
    )
    why = f"{phase.title()} at homehub ({local.strftime('%H:%M')})"
    return phase, why + (f" · curfew for {', '.join(curfews)}" if curfews else "")


def sky_track(phase: str) -> str:
    """Return the bar's sun (or, at night and in curfew, moon) on its track.

    The track is the bar's empty middle, between the sections and the theme
    switch, so the body never passes behind a control or off the bar. The
    page script places it on its arc by the clock (the sun from dawn to
    nightfall, sky_hours, the moon through the night). Decoration only.
    """
    body = "moon" if phase == "night" else "sun"
    now = local_now()
    up, _day, _dusk, down = sky_hours(now.date(), now.tzinfo)
    return (
        '<span class="sky-track" aria-hidden="true">'
        f'<span class="sky-body sky-{body}" data-up="{up:.3f}" data-down="{down:.3f}"></span>'
        "</span>"
    )
