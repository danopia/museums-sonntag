/** @jsx h */
import html, { Fragment, h, VNode } from "https://deno.land/x/htm@0.1.4/mod.ts";
import { Shop } from "./gomus-api.ts";

export function htmlResponse(reqUrl: string, locale: 'de' | 'en', shop: Shop, body: VNode) {
  const {origin} = new URL(reqUrl);
  const path = reqUrl.slice(origin.length + 3);

  return html({
    lang: locale,
    title: locale == 'de'
      ? `Museums Sonntag Verfügbarkeit`
      : `Museum Sunday Availability`,
    body: (
      <div class="flex flex-col items-center justify-center w-full">
        <Header locale={locale} shop={shop} />
        {body}
        <Footer locale={locale} pagePath={path} />
      </div>
    ),
  });
}

function Header(props: {
  locale: 'en' | 'de';
  shop: Shop;
}) {
  const ticketsFreeText = props.shop.content?.shop_tickets_global_free_field_text?.replaceAll(/<[^>]+>/g, '');

  const title = props.locale == 'de'
    ? 'Berlin Museums Sonntag'
    : 'Berlin Museum Sunday';
  const subtitle = props.locale == 'de'
    ? 'Alle Eintrittskartenplätze und aktuelle Verfügbarkeit'
    : 'All ticket slots and current availability';

  return (<Fragment>
    <h1 class="mt-8 text-4xl font-bold">{title}</h1>
    <p class="mt-2 text-lg text-center text-gray-600">{subtitle}</p>

    {ticketsFreeText ? (
      <blockquote class="mt-4 m-2 pl-4 p-2 max-w-xl italic text-gray-700" style="border-left: 0.25em solid #999;">
        <p>{ticketsFreeText}</p>
      </blockquote>
    ) : []}
  </Fragment>);
}

function Footer(props: {
  locale: 'en' | 'de';
  pagePath: string;
}) {

  const loadedFrom = props.locale == 'de'
    ? 'Daten geladen von'
    : 'Data loaded from';
  const publicAPI = props.locale == 'de'
    ? 'Public-API'
    : 'public API';

  const enLang = props.locale == 'de'
    ? 'Englisch'
    : 'English';
  const deLang = props.locale == 'de'
    ? 'Deutsch'
    : 'German';

  return (
    <footer class="mt-8 bottom-8 pb-16 w-full flex flex-col items-center justify-center gap-2 text-gray-800 text-sm text-center">

      <div>
        {loadedFrom} <a
          class="text-black font-semibold"
          href="https://giantmonkey.github.io/gomus-api-doc/public_api.html"
        >
          go~mus {publicAPI}
        </a>
      </div>

      <div>
        <a href={`/en${props.pagePath}`} class={props.locale == 'en' ? 'font-semibold' : 'underline'}>{enLang}</a>
        {" | "}
        <a href={`/de${props.pagePath}`} class={props.locale == 'de' ? 'font-semibold' : 'underline'}>{deLang}</a>
      </div>

    </footer>
  );
}
