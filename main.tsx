/** @jsx h */
import { ConnInfo, serve } from "https://deno.land/std@0.177.0/http/server.ts";
import html, { h } from "https://deno.land/x/htm@0.1.4/mod.ts";
import UnoCSS from "https://deno.land/x/htm@0.1.4/plugins/unocss.ts";
import { createReporter } from "https://deno.land/x/g_a@0.1.2/mod.ts";

html.use(UnoCSS());

const ga = createReporter({ id: 'UA-188510615-2' });

import { api } from "./gomus-api.ts";
import { describeQuotas } from "./quotas.ts";
import { reportQuotaMetrics } from "./metrics.ts";
import { htmlResponse } from "./template.tsx";

const museumMap = await api.getMuseumsPage();

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

const datePattern = new URLPattern({ pathname:'/:date([0-9]{4}-[0-9]{2}-[0-9]{2})' });

async function router(req: Request, connInfo: ConnInfo) {
  const url = new URL(req.url);

  const { hostname } = connInfo.remoteAddr as Deno.NetAddr;
  console.log(hostname, 'GET', url.pathname, req.headers.get('user-agent'));

  if (url.pathname === '/') {
    return await indexHandler(req);
  }
  {
    const match = datePattern.exec(url);
    if (match) {
      return await ticketsHandler(req, match.pathname.groups['date']);
    }
  }
  return new Response('Not found', { status: 404 });
}

const indexHandler = async (req: Request) => {
  if (req.method !== "GET") {
    return new Response('Method not allowed', { status: 405 });
  }

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
      headers: {
        location: `/${openDate}`,
      },
    });
  }

  return htmlResponse(
    <div class="max-w-xl my-8 text-center status-box">
      <h3 class="mt-4 text-2xl text-gray-800">No current availabilities</h3>
      <p class="mt-2 text-md text-gray-800">
        Tickets become available around a week before the first Sunday of each month.
        Once they are fully booked, new availabilities only come from cancellations.
      </p>
    </div>
  );
}

const ticketsHandler = async (req: Request, dateStr: string) => {
  if (req.method !== "GET") {
    return new Response('Method not allowed', { status: 405 });
  }

  const date = new Date(dateStr);

  const rows = await describeQuotas(museumMap, api, date)
    .then(list => list.filter(x => x.total_tickets > 0));
  rows.sort((a,b) => b.available_tickets - a.available_tickets);

  if (rows.length == 0) {
    return htmlResponse(
      <div class="max-w-xl my-8 text-center">
        <h3 class="mt-4 text-2xl text-gray-800">No availabilities found</h3>
        <p class="mt-2 text-md text-gray-800">
          For <code>{dateStr}</code> there just aren't any tickets currently available.
          Sorry.
        </p>
        <p class="mt-2 text-md text-gray-800">
          <a href="/">Back to homepage</a>
        </p>
      </div>
    );
  }

  reportQuotaMetrics(rows);

  return htmlResponse(
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
  );
};

serve(handler);
