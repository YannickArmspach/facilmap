import { streamPromiseToStream } from "../utils/streams.js";
import type { MapId, ID } from "facilmap-types";
import Database from "../database/database.js";
import type { ReadableStream } from "stream/web";
import { stringify } from "csv-stringify";
import { Readable, Writable } from "stream";
import { getTabularData } from "./tabular.js";

export function exportCsv(
	database: Database,
	mapId: MapId,
	typeId: ID,
	filter?: string,
	hide: string[] = []
): ReadableStream<string> {
	return streamPromiseToStream((async () => {
		const tabular = await getTabularData(database, mapId, typeId, false, filter, hide);

		const stringifier = stringify();
		stringifier.write(tabular.fieldNames);
		void tabular.objects.pipeTo(Writable.toWeb(stringifier));

		return Readable.toWeb(stringifier);
	})());
}
