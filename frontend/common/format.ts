/// <reference path="../node_modules/@types/jquery/JQueryStatic.d.ts" />

import marked, { MarkedOptions } from 'marked';
import { Field } from "facilmap-types";

const isBrowser = (typeof window !== "undefined");
const jQuery: JQueryStatic | null = isBrowser ? require("jquery") : null;
const cheerio: cheerio.CheerioAPI | null = isBrowser ? null : require("cheerio");

marked.setOptions({
	breaks: true,
	sanitize: true
});

export function normalizeField(field: Field, value: string, enforceExistingOption: boolean) {
	if(value == null)
		value = field['default'] || "";

	if(field.type == "checkbox")
		value = value == "1" ? "1" : "0";

	if(enforceExistingOption && field.type == "dropdown" && !field.options?.some((option) => option.value == value) && field.options?.[0])
		value = field.options[0].value;

	return value;
}

export function formatField(field: Field, value: string) {
	value = normalizeField(field, value, false);
	switch(field.type) {
		case "textarea":
			return markdownBlock(value);
		case "checkbox":
			return value == "1" ? "✔" : "✘";
		case "dropdown":
			return value || "";
		case "input":
		default:
			return markdownInline(value);
	}
}

export function markdownBlock(string: string, options?: MarkedOptions) {
	const [$, ret] = createDiv();

	ret.html(marked(string, options));
	applyMarkdownModifications(ret, $);
	return ret.html();
}

export function markdownInline(string: string, options?: MarkedOptions) {
	const [$, ret] = createDiv();

	ret.html(marked(string, options));
	$("p", ret).replaceWith(function(this: cheerio.Element) { return $(this).contents(); });
	applyMarkdownModifications(ret, $);
	return ret.html();
}

export function round(number: number, digits: number) {
	const fac = Math.pow(10, digits);
	return Math.round(number*fac)/fac;
}

export function formatTime(seconds: number) {
	const hours = Math.floor(seconds/3600);
	let minutes: string | number = Math.floor((seconds%3600)/60);
	if(minutes < 10)
		minutes = "0" + minutes;
	return hours + ":" + minutes;
}

function applyMarkdownModifications($el: cheerio.Cheerio, $: cheerio.Root) {
	$("a[href]", $el).attr({
		target: "_blank",
		rel: "noopener noreferer"
	});

	$("a[href^='mailto:']", $el).each(function(this: cheerio.Element) {
		const $a = $(this);
		let m = $a.attr("href")!.match(/^mailto:(.*)@(.*)$/i);
		if(m) {
			$a.attr({
				href: "#",
				"data-u": m[1],
				"data-d": m[2]
			}).addClass("emobf");
		}

		m = $a.text().match(/^(.*)@(.*)$/);
		if(m && $a.children().length == 0) {
			$a.attr({
				"data-u2": m[1],
				"data-d2": m[2]
			}).addClass("emobf2").html("<span>[obfuscated]</span>");
		}
	});
}

function createDiv(): [cheerio.Root, cheerio.Cheerio] {
	const $ = isBrowser ? jQuery! : cheerio!.load("<div/>");
	const div = isBrowser ? ($ as JQueryStatic)("<div/>") : ($ as cheerio.Root).root();
	return [$ as cheerio.Root, div as cheerio.Cheerio];
}