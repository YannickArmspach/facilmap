import request from "../utils/request";
import config from "../config";
import { Point, RouteMode } from "facilmap-types";
import { RawRouteInfo } from "./routing";

const ROUTING_URL = "https://api.mapbox.com/directions/v5/mapbox";

const ROUTING_TYPES = {
	car: "driving",
	bicycle: "cycling",
	pedestrian: "walking"
} as Record<RouteMode, string>;

const MAX_POINTS_PER_REQUEST = 25;

export async function calculateOSRMRoute(points: Point[], mode: RouteMode, simple = false): Promise<RawRouteInfo> {
	const coordGroups: string[][] = [[]];
	for(const point of points) {
		if(coordGroups[coordGroups.length-1].length >= MAX_POINTS_PER_REQUEST)
			coordGroups.push([]);

		coordGroups[coordGroups.length-1].push(point.lon + "," + point.lat);
	}

	const results = await Promise.all(coordGroups.map((coords) => {
		const url = ROUTING_URL + "/" + ROUTING_TYPES[mode] + "/" + coords.join(";")
			+ "?alternatives=false"
			+ "&steps=false"
			+ "&geometries=geojson"
			+ "&overview=" + (simple ? "simplified" : "full")
			+ "&access_token=" + encodeURIComponent(config.mapboxToken ?? "");

		return request.get({ url, json: true });
	}));

	const ret: RawRouteInfo = {
		trackPoints: [],
		distance: 0,
		time: 0
	};

	for(const body of results) {
		if(!body || (body.code == "OK" && (!body.legs || !body.legs[0])))
			throw new Error("Invalid response from routing server.");

		if(body.code != 'Ok')
			throw new Error("Route could not be calculated (" + body.code + ").");

		const trackPoints = body.routes[0].geometry.coordinates.map((it: any) => ({ lat: it[1], lon: it[0] }));
		if(trackPoints.length > 0 && ret.trackPoints.length > 0 && trackPoints[0].lat == ret.trackPoints[ret.trackPoints.length-1].lat && trackPoints[0].lon == ret.trackPoints[ret.trackPoints.length-1].lon)
			trackPoints.shift();

		ret.trackPoints.push(...trackPoints);
		ret.distance += body.routes[0].distance/1000;
		ret.time += body.routes[0].duration;
	}

	return ret;
}
