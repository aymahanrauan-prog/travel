/**
 * api.js - external public APIs (no API key needed).
 *
 *   1. World Bank Open Data -> "Kazakhstan at a glance" block on the home page
 *   2. Open-Meteo      -> live weather widget on the Destinations page
 *
 * Both widgets show a loading state and a friendly error message with a
 * "Try again" button when the request fails.
 */
(function () {
    'use strict';

    /* ---------- Helpers ---------- */

    // Loads JSON; gives up after 10 seconds so the spinner never runs forever
    function fetchJson(url) {
        var controller = new AbortController();
        var timer = setTimeout(function () { controller.abort(); }, 10000);

        return fetch(url, { signal: controller.signal })
            .then(function (response) {
                if (!response.ok) { throw new Error('HTTP ' + response.status); }
                return response.json();
            })
            .finally(function () { clearTimeout(timer); });
    }

    function escapeHtml(text) {
        return String(text).replace(/[&<>"']/g, function (char) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
        });
    }

    function loadingHtml(text) {
        return '<div class="status-box" role="status"><div class="spinner-border spinner-border-sm text-primary" aria-hidden="true"></div><span>' + text + '</span></div>';
    }

    function errorHtml(text) {
        return '<div class="alert alert-warning mb-0 d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">' +
            '<span>' + text + '</span>' +
            '<button type="button" class="btn btn-sm btn-outline-primary retry-btn">Try again</button></div>';
    }

    // Calls load() again when the "Try again" button inside the container is pressed
    function bindRetry(container, load) {
        var button = container.querySelector('.retry-btn');
        if (button) { button.addEventListener('click', load); }
    }

    /* ---------- 1. Country facts (World Bank Open Data) ---------- */

    var factsBox = document.getElementById('country-facts');
    var WB_URL = 'https://api.worldbank.org/v2/country/KZ';

    function tile(label, value) {
        return '<div class="col-6 col-lg-4"><div class="fact-tile"><div class="label">' + label +
            '</div><div class="value">' + escapeHtml(value) + '</div></div></div>';
    }

    // One indicator (e.g. population): the answer is [info, [newest year, older year, ...]]
    // We take the newest year that has a value.
    function loadIndicator(code) {
        return fetchJson(WB_URL + '/indicator/' + code + '?format=json&date=2012:2026&per_page=20')
            .then(function (data) {
                var rows = Array.isArray(data) && Array.isArray(data[1]) ? data[1] : [];
                var found = rows.find(function (row) { return row.value !== null && row.value !== undefined; });
                if (!found) { throw new Error('No data for ' + code); }
                return { value: Number(found.value), year: found.date };
            });
    }

    function loadCountryInfo() {
        return fetchJson(WB_URL + '?format=json').then(function (data) {
            var info = Array.isArray(data) && Array.isArray(data[1]) ? data[1][0] : null;
            if (!info) { throw new Error('No country data'); }
            return info;
        });
    }

    function renderFacts(info, population, area, gdp) {
        factsBox.innerHTML =
            '<div class="d-flex align-items-center gap-3 mb-3">' +
                '<img src="https://flagcdn.com/w160/kz.png" alt="Flag of Kazakhstan" class="flag-img">' +
                '<h3 class="h5 mb-0">' + escapeHtml(info.name) + '</h3>' +
            '</div>' +
            '<div class="row g-3">' +
                tile('Capital', info.capitalCity) +
                tile('Population (' + population.year + ')', Math.round(population.value).toLocaleString('en-US')) +
                tile('Area', Math.round(area.value).toLocaleString('en-US') + ' km\u00B2') +
                tile('GDP per person (' + gdp.year + ')', '$' + Math.round(gdp.value).toLocaleString('en-US')) +
                tile('Region', info.region.value) +
                tile('Income level', info.incomeLevel.value) +
            '</div>' +
            '<p class="small text-muted mt-3 mb-0">Source: World Bank Open Data.</p>';

        // If the flag image cannot be loaded, just hide it
        var flag = factsBox.querySelector('.flag-img');
        if (flag) { flag.addEventListener('error', function () { flag.remove(); }); }
    }

    function loadFacts() {
        factsBox.innerHTML = loadingHtml('Loading facts about Kazakhstan...');

        // Four small requests run at the same time
        Promise.all([
            loadCountryInfo(),
            loadIndicator('SP.POP.TOTL'),     // population
            loadIndicator('AG.SRF.TOTL.K2'),  // surface area, km2
            loadIndicator('NY.GDP.PCAP.CD')   // GDP per person, US$
        ])
            .then(function (results) {
                renderFacts(results[0], results[1], results[2], results[3]);
            })
            .catch(function () {
                factsBox.innerHTML = errorHtml('We could not load the country facts right now.');
                bindRetry(factsBox, loadFacts);
            });
    }

    if (factsBox) { loadFacts(); }

    /* ---------- 2. Weather (Open-Meteo) ---------- */

    var weatherBox = document.getElementById('weather-result');
    var citySelect = document.getElementById('weather-city');
    var CITY_KEY = 'kz-weather-city';

    var cities = {
        astana: { name: 'Astana', lat: 51.13, lon: 71.43 },
        almaty: { name: 'Almaty', lat: 43.24, lon: 76.89 },
        turkistan: { name: 'Turkistan', lat: 43.30, lon: 68.27 },
        aktau: { name: 'Aktau', lat: 43.65, lon: 51.15 },
        burabay: { name: 'Burabay', lat: 53.08, lon: 70.30 }
    };

    // Open-Meteo weather codes -> text and icon
    function describeWeather(code) {
        if (code === 0) { return { text: 'Clear sky', icon: 'bi-sun' }; }
        if (code <= 3) { return { text: 'Partly cloudy', icon: 'bi-cloud-sun' }; }
        if (code <= 48) { return { text: 'Fog', icon: 'bi-cloud-fog' }; }
        if (code <= 57) { return { text: 'Drizzle', icon: 'bi-cloud-drizzle' }; }
        if (code <= 67) { return { text: 'Rain', icon: 'bi-cloud-rain' }; }
        if (code <= 77) { return { text: 'Snow', icon: 'bi-snow' }; }
        if (code <= 82) { return { text: 'Rain showers', icon: 'bi-cloud-rain-heavy' }; }
        if (code <= 86) { return { text: 'Snow showers', icon: 'bi-cloud-snow' }; }
        return { text: 'Thunderstorm', icon: 'bi-cloud-lightning-rain' };
    }

    function renderWeather(city, data) {
        var now = data.current;
        var units = data.current_units;
        var info = describeWeather(now.weather_code);

        weatherBox.innerHTML =
            '<div class="weather-now">' +
                '<i class="bi ' + info.icon + '" aria-hidden="true"></i>' +
                '<div>' +
                    '<div class="weather-temp">' + Math.round(now.temperature_2m) + units.temperature_2m + '</div>' +
                    '<div class="fw-semibold">' + info.text + ' in ' + escapeHtml(city.name) + '</div>' +
                    '<div class="text-muted small">Wind ' + now.wind_speed_10m + ' ' + units.wind_speed_10m + '</div>' +
                '</div>' +
            '</div>';
    }

    function loadWeather() {
        var city = cities[citySelect.value] || cities.astana;
        weatherBox.innerHTML = loadingHtml('Loading weather for ' + city.name + '...');

        var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + city.lat + '&longitude=' + city.lon +
            '&current=temperature_2m,wind_speed_10m,weather_code&timezone=auto';

        fetchJson(url)
            .then(function (data) { renderWeather(city, data); })
            .catch(function () {
                weatherBox.innerHTML = errorHtml('We could not load the weather right now.');
                bindRetry(weatherBox, loadWeather);
            });
    }

    if (weatherBox && citySelect) {
        try {
            var savedCity = localStorage.getItem(CITY_KEY);
            if (savedCity && cities[savedCity]) { citySelect.value = savedCity; }
        } catch (error) { /* ignore */ }

        citySelect.addEventListener('change', function () {
            try { localStorage.setItem(CITY_KEY, citySelect.value); } catch (error) { /* ignore */ }
            loadWeather();
        });
        loadWeather();
    }
})();
