import { View } from "facilmap-types";
import { fmToLeafletBbox, leafletToFmBbox, pointsEqual } from "../utils/leaflet";
import { Map } from "leaflet";
import { getVisibleLayers, setVisibleLayers } from "../layers";
import { isEqual } from "lodash";
import OverpassLayer from "../overpass/overpass-layer";
import { decodeOverpassQuery, encodeOverpassQuery, isEncodedOverpassQuery } from "../overpass/overpass-utils";

export type UnsavedView = Omit<View, 'id' | 'padId' | 'name'>;

export function getCurrentView(map: Map, { includeFilter = false, overpassLayer }: { includeFilter?: boolean; overpassLayer?: OverpassLayer } = {}): UnsavedView {
	const visibleLayers = getVisibleLayers(map);
	const ret: UnsavedView = {
		...leafletToFmBbox(map.getBounds()),
		baseLayer: visibleLayers.baseLayer,
		layers: visibleLayers.overlays
	};

	if (overpassLayer && !overpassLayer.isEmpty())
		ret.layers.push(encodeOverpassQuery(overpassLayer.getQuery())!);

	if (includeFilter && map.fmFilter) {
		ret.filter = map.fmFilter;
	}

	return ret;
}

const DEFAULT_VIEW: UnsavedView = { top: -90, bottom: 90, left: -180, right: 180, baseLayer: undefined as any, layers: [] };

export function displayView(map: Map, view?: UnsavedView | null, { _zoomFactor = 0, overpassLayer }: { _zoomFactor?: number, overpassLayer?: OverpassLayer } = {}): void {
	if (view == null)
		view = DEFAULT_VIEW;

	setVisibleLayers(map, {
		baseLayer: view.baseLayer,
		overlays: view.layers
	});

	if (overpassLayer)
		overpassLayer.setQuery(decodeOverpassQuery(view.layers.find((l) => isEncodedOverpassQuery(l))));

	const bounds = fmToLeafletBbox(view);

	try {
		map.getCenter(); // Throws exception if map not initialised
		map.flyTo(bounds.getCenter(), map.getBoundsZoom(bounds, view === DEFAULT_VIEW) + _zoomFactor);
	} catch(e) {
		map.setView(bounds.getCenter(), map.getBoundsZoom(bounds, view === DEFAULT_VIEW) + _zoomFactor);
	}

	map.setFmFilter(view.filter);
}

export function isAtView(map: Map, view = DEFAULT_VIEW, { overpassLayer }: { overpassLayer?: OverpassLayer } = {}): boolean {
	try {
		map.getCenter();
	} catch(e) {
		return false;
	}

	const currentView = getCurrentView(map, { overpassLayer });
	const bounds = fmToLeafletBbox(view);

	return (
		currentView.baseLayer === view.baseLayer
		&& isEqual(currentView.layers, view.layers)
		&& map.getBoundsZoom(bounds, view === DEFAULT_VIEW) == map.getZoom()
		&& pointsEqual(bounds.getCenter(), map.getCenter(), map)
		&& ((!map.fmFilter && !view.filter) || (map.fmFilter == view.filter))
	);
}