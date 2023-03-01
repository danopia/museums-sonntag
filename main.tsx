/** @jsx h */
import { ConnInfo, serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { h, html } from "https://deno.land/x/htm@0.0.10/mod.tsx";
import { UnoCSS } from "https://deno.land/x/htm@0.0.10/plugins.ts";
import { createReporter } from "https://deno.land/x/g_a@0.1.2/mod.ts";

import DatadogApi from "https://deno.land/x/datadog_api@v0.1.5/mod.ts";
const datadog = DatadogApi.fromEnvironment(Deno.env);
const host_name = [
  Deno.env.get('DENO_REGION'),
].filter(x => x).map(x => `deno-deploy-${x}`)[0] ?? 'localhost';

// enable UnoCSS
html.use(UnoCSS())

const ga = createReporter({ id: 'UA-188510615-2' });

import { GomusApi, Museum, Ticket } from "./gomus-api.ts";
const api = new GomusApi("shop.museumssonntag.berlin", "en");

const date = new Date(Date.UTC(2023, 3-1, 5));
const dateStr = date.toISOString().split('T')[0];

const museumMap = await api.getMuseumsPage();
const ticketMap = await api.getTicketsPage({ validAt: date });
const shopPage = await api.getShop();

const handler = async (req: Request, connInfo: ConnInfo) => {
  console.log(connInfo.remoteAddr.hostname, 'GET', new URL(req.url).pathname, req.headers.get('user-agent'));

  let err;
  let res: Response;
  const start = performance.now();
  try {
    // processing of the request...
    res = await ticketsHandler(req);
  } catch (e) {
    err = e;
  } finally {
    ga(req, connInfo, res!, start, err);
  }
  if (err) throw err;
  return res!;
};

const ticketsHandler = async (req: Request) => {
  if (new URL(req.url).pathname !== '/') {
    return new Response('Not found', { status: 404 });
  }
  if (req.method !== "GET") {
    return new Response('Method not allowed', { status: 405 });
  }

  const caps = await api.getTicketCapacities(date, Array
    .from(ticketMap.values())
    .filter(x => x.ticket_type === 'time_slot')
    .map(x => x.id));

  const rows = new Array<{
    museum: Museum;
    tickets: Array<Ticket>;
    slot_count: number;
    slot_size: number;
    total_tickets: number;
    available_tickets: number;
    book_url: string;
  }>();

  // console.log(caps);
  for (const quota of Object.values(caps)) {
    const tickets = quota.tickets.flatMap(x => ticketMap.has(x) ? [ticketMap.get(x)!] : []);
    const museumIds = Array.from(new Set(tickets.flatMap(x => x.museum_ids)));
    const [museum] = museumIds.map(x => museumMap.get(x) ?? { id: x, title: `` });
    const capacities = Object.values(quota.capacities);
    const total_capacities = Object.values(quota.total_capacities);
    const total_tickets = total_capacities.reduce((a,b) => a+b, 0);
    const available_tickets = capacities.reduce((a,b) => a+b, 0);
    if (total_tickets == 0) continue;
    const bookParams = new URLSearchParams();
    if (museumIds[0]) bookParams.append('museum_id', `${museumIds[0]}`);
    bookParams.append('group', 'timeSlot');
    bookParams.append('date', dateStr);
    const firstTimeSlot = Object.entries(quota.capacities).find(x => x[1] > 0)?.[0];
    if (firstTimeSlot) bookParams.append('time', firstTimeSlot);
    rows.push({
      museum: museum,
      tickets: tickets,
      slot_count: capacities.length,
      slot_size: total_capacities[0],
      total_tickets,
      available_tickets,
      book_url: `https://shop.museumssonntag.berlin/#/tickets/time?${bookParams}`,
    });
  }

  rows.sort((a,b) => b.available_tickets - a.available_tickets);

  datadog.v1Metrics.submit(rows.flatMap(row => [{
    metric_name: 'museumssonntag.slot_count',
    metric_type: 'gauge',
    points: [{ value: row.slot_count }],
    tags: [`museum:${row.museum?.title ?? 'none'}`],
    host_name,
  }, {
    metric_name: 'museumssonntag.slot_size',
    metric_type: 'gauge',
    points: [{ value: row.slot_size }],
    tags: [`museum:${row.museum?.title ?? 'none'}`],
    host_name,
  }, {
    metric_name: 'museumssonntag.tickets_total',
    metric_type: 'gauge',
    points: [{ value: row.total_tickets }],
    tags: [`museum:${row.museum?.title ?? 'none'}`],
    host_name,
  }, {
    metric_name: 'museumssonntag.tickets_available',
    metric_type: 'gauge',
    points: [{ value: row.available_tickets }],
    tags: [`museum:${row.museum?.title ?? 'none'}`],
    host_name,
  }]));

  const ticketsFreeText = shopPage.content?.shop_tickets_global_free_field_text?.replaceAll(/<[^>]+>/g, '');

  return html({
    title: "Ticket Availability - Berlin Museum Sunday",
    body: (
      <div
        class="flex flex-col items-center justify-center w-full"
        /*style="background-image:url('https://dash.deno.com/assets/background-pattern.svg')"*/
      >
        <h1 class="mt-8 text-4xl font-bold">Berlin Museum Sunday</h1>
        <p class="mt-2 text-lg text-center text-gray-600">All ticket slots and current availability</p>

        {ticketsFreeText ? (
          <blockquote class="mt-4 m-2 pl-4 p-2 max-w-xl italic text-gray-700" style="border-left: 0.25em solid #999;">
            <p>{ticketsFreeText}</p>
          </blockquote>
        ) : []}

        <table class="md:mx-4 my-4">
          <thead>
            <tr>
              <th class="hidden lg:table-cell"></th>
              <th>Offer</th>
              <th class="p-2 hidden md:table-cell">Timeslots</th>
              <th class="p-2 hidden md:table-cell">Total</th>
              <th class="p-2">Available</th>
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
                  <img class="pic" src={row.museum.picture.detail_3x2} width="200" title={row.museum.picture.copyright_info} />
                ) : (
                  <div class="pic bg-gray-300" style="width: 200px; height: 133px;"></div>
                )}</td>
                <td class="pl-4 p-2">
                  {row.museum?.title ?? (<em>(No museum title)</em>)}
                  <ul>
                    {row.tickets.map(x => (
                      <li class="ml-4 list-circle">
                        {x.title?.includes('Time-Slot') ? `${x.entry_duration}min ` : ''}
                        {x.title?.replace(` — ${row.museum?.title || 'zzz'}`, '') ?? (<em>(no ticket title)</em>)}
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
                  <a class="display-block text-center p-1 text-white bg-green-500 hover:bg-green-700" href={row.book_url} target="_blank">Book</a>
                ) : []}</td>
              </tr>
            ))}
          </tbody>

        </table>

        <footer class="bottom-8 pb-16 w-full h-6 flex items-center justify-center gap-2 text-gray-800">
          Data loaded from
          <a
            class="flex items-center gap-2 text-sm text-black no-underline font-semibold"
            href="https://gomus.de/"
          >
            <img alt="Deno" src="https://dash.deno.com/assets/logo.svg" class="w-5" style="display: none;" />
            go~mus public API
          </a>
        </footer>
      </div>
    ),
  });
};

serve(handler);
