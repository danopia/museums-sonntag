/** @jsx h */
import { ConnInfo, serve } from "https://deno.land/std@0.177.0/http/server.ts";
import html, { h } from "https://deno.land/x/htm@0.1.4/mod.ts";
import UnoCSS from "https://deno.land/x/htm@0.1.4/plugins/unocss.ts";
import { createReporter } from "https://deno.land/x/g_a@0.1.2/mod.ts";

html.use(UnoCSS());

const ga = createReporter({ id: 'UA-188510615-2' });

import { apiEN, apiDE } from "./gomus-api.ts";
import { describeQuotas } from "./quotas.ts";
import { reportQuotaMetrics } from "./metrics.ts";
import { htmlResponse } from "./template.tsx";

async function handler(req: Request, connInfo: ConnInfo) {
  let err;
  let res: Response;
  const start = performance.now();
  try {
    res = await router(req, connInfo);
  } catch (e) {
    err = e;
  } finally {
    ga(req, connInfo, res!, start, err);
  }
  if (err) throw err;
  return res!;
}

const homePattern = new URLPattern({ pathname:'/:locale(en|de){/}?' });
const datePattern = new URLPattern({ pathname:'/:locale(en|de)/:date([0-9]{4}-[0-9]{2}-[0-9]{2})' });

async function router(req: Request, connInfo: ConnInfo) {
  const url = new URL(req.url);
  const { hostname } = connInfo.remoteAddr as Deno.NetAddr;
  const locale = req.headers.get('accept-language')?.split(',')[0].startsWith('de-') ? 'de' : 'en';

  console.log(hostname, 'GET', url.pathname,
    req.headers.get('user-agent'),
    req.headers.get('accept-language')?.split(','));

  if (url.pathname === '/') {
    return await indexHandler(req, locale);
  }
  {
    const match = homePattern.exec(url);
    if (match) {
      return await indexHandler(req,
        match.pathname.groups['locale'] as 'en'|'de');
    }
  }
  {
    const match = datePattern.exec(url);
    if (match) {
      return await ticketsHandler(req,
        match.pathname.groups['locale'] as 'en'|'de',
        match.pathname.groups['date']);
    }
  }
  return new Response('Not found', { status: 404 });
}

const indexHandler = async (req: Request, locale: 'en' | 'de') => {
  if (req.method !== "GET") {
    return new Response('Method not allowed', { status: 405 });
  }
  const api = locale == 'de' ? apiDE : apiEN;

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 1);
  const monthAway = new Date(startDate);
  monthAway.setDate(monthAway.getDate() + 45);

  const calendar = await api.getTicketCalendar({
    byTicketType: 'time_slot',
    startDate,
    endDate: monthAway,
  });

  const openDate = calendar.find(x => x[1])?.[0];
  if (openDate) {
    return new Response(`The next date is ${openDate}. Check ${new URL(`/${openDate}`, req.url)}`, {
      status: 303,
      headers: {
        location: `/${locale}/${openDate}`,
      },
    });
  }

  const shop = await api.getShop();
  return htmlResponse(locale, shop,
    <div class="max-w-xl my-8 text-center status-box">
      <h3 class="mt-4 text-2xl text-gray-800">
        {shop.translations['common.empty']}
      </h3>
      <p class="mt-2 text-md text-gray-800">
        {locale == 'en' ? `
          Tickets become available around a week before the first Sunday of each month.
          Once they are fully booked, new availabilities only come from cancellations.
        ` : `
          Die Eintrittskarten werden etwa eine Woche vor dem ersten Sonntag eines jeden Monats verfügbar.
          Sobald sie ausgebucht sind, werden neue Plätze nur noch durch Stornierungen frei.
        `}
      </p>
    </div>
  );
}

const ticketsHandler = async (req: Request, locale: 'en' | 'de', dateStr: string) => {
  if (req.method !== "GET") {
    return new Response('Method not allowed', { status: 405 });
  }
  const api = locale == 'de' ? apiDE : apiEN;
  const date = new Date(dateStr);

  const museumMap = await api.getMuseumsPage();
  const rows = await describeQuotas(museumMap, api, date)
    .then(list => list.filter(x => x.total_tickets > 0));
  const shop = await api.getShop();

  rows.sort((a,b) => b.available_tickets - a.available_tickets);

  if (rows.length == 0) {
    return htmlResponse(locale, shop,
      <div class="max-w-xl my-8 text-center">
        <h3 class="mt-4 text-2xl text-gray-800">
          {shop.translations['common.empty']}
        </h3>
        <p class="mt-2 text-md text-gray-800">
          {shop.translations['tickets.empty']}
          {" "}
          Sorry.
        </p>
        <p class="mt-2">
          <a href={`/${locale}/`} class="text-sm text-black no-underline font-semibold">
            {shop.translations['header.aria.home']}
          </a>
        </p>
      </div>
    );
  }

  reportQuotaMetrics(rows);

  return htmlResponse(locale, shop,
    <table class="md:mx-4 my-4">
      <thead>
        <tr>
          <th class="hidden lg:table-cell"></th>
          <th>
            {shop.translations['cart.content.table.desc']}
          </th>
          <th class="p-2 hidden md:table-cell">
            {shop.translations['ticket.timeSlot.title']}
          </th>
          <th class="p-2 hidden md:table-cell">
            {shop.translations['cart.content.table.total']}
          </th>
          <th class="p-2">
            {shop.translations['product.dates.table.free']}
          </th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr class={`border-t border-gray-200 lg:border-t-0 ${
              row.available_tickets > 100
                ? 'bg-green-100 hover:bg-green-200'
                : (row.available_tickets > 10
                  ? 'bg-yellow-100 hover:bg-yellow-200'
                  : (row.available_tickets > 0
                    ? 'bg-orange-200 hover:bg-orange-300'
                    : 'bg-red-50 hover:bg-red-100'))}`}>
            <td class="hidden lg:table-cell">{row.museum.picture ? (
              <img class="pic" src={row.museum.picture.detail_3x2} width="200" title={row.museum.picture.copyright_info?.replaceAll(/<[^>]+>/g, '')} />
            ) : (
              <div class="pic bg-gray-300" style="width: 200px; height: 133px;" title={shop.translations['404.description']}></div>
            )}</td>
            <td class="pl-4 p-2">
              {row.museum?.title || (<em>({shop.translations['museum.error.title']})</em>)}
              <ul>
                {row.tickets.map(x => (
                  <li class="ml-4 list-circle">
                    {x.title?.includes('Time-Slot') ? `${x.entry_duration}' ` : ''}
                    {x.title?.replace(` — ${row.museum?.title || 'zzz'}`, '') || (<em>({shop.translations['product.error.title']})</em>)}
                  </li>
                ))}
              </ul>
            </td>
            <td class="text-center hidden md:table-cell">{row.slot_count} &times; {row.slot_size}</td>
            <td class="text-center hidden md:table-cell">{row.total_tickets}</td>
            <td class="text-center">
              {row.available_tickets}
              {row.available_tickets > 0 ? (
                <meter style="width: 90%;"
                    value={row.total_tickets - row.available_tickets}
                    max={row.total_tickets}
                    high={Math.max(row.total_tickets - 10, 2)}
                    low={Math.max(row.total_tickets - 100, 1)}
                    optimum={0}
                  />
              ) : []}
            </td>
            <td class="pr-4">{row.available_tickets > 0 ? (
              <a class="display-block text-center p-1 text-white bg-green-500 hover:bg-green-700" href={row.book_url} target="_blank">
                {shop.translations['product.dates.table.button']}
              </a>
            ) : []}</td>
          </tr>
        ))}
      </tbody>

    </table>
  );
};

serve(handler);
