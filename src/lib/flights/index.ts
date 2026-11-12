/**
 * Live aircraft over the Bay Area, for GET /api/flights. See proxy.ts for
 * the caching and failure behaviour, adsblol.ts for the upstream (and what
 * about it is unverified), area.ts for the area. Contract and operations:
 * docs/flights-proxy.md.
 */
export { ATTRIBUTION, LICENSE_URL, SOURCE, upstreamUrl, type Aircraft } from './adsblol';
export { BOX, CENTRE, RADIUS_NM } from './area';
export { createFlightsProxy, type FlightsBody, type FlightsProxy, type FlightsProxyOptions } from './proxy';
