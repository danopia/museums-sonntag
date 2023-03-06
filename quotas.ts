import { GomusApi, Museum, Ticket } from "./gomus-api.ts";

export type Quota = {
  museum: Museum;
  tickets: Array<Ticket>;
  slot_count: number;
  slot_size: number;
  total_tickets: number;
  available_tickets: number;
  book_url: string;
};

export async function describeQuotas(museumMap: Map<number, Museum>, api: GomusApi, date: Date) {
  const ticketMap = await api.getTicketsPage({ validAt: date });
  if (ticketMap.size == 0) return [];

  const caps = await api.getTicketCapacities(date, Array
    .from(ticketMap.values())
    .filter(x => x.ticket_type === 'time_slot')
    .map(x => x.id));

  return Object.values(caps).map<Quota>(quota => {
    const tickets = quota.tickets.flatMap(x => ticketMap.has(x) ? [ticketMap.get(x)!] : []);
    const museumIds = Array.from(new Set(tickets.flatMap(x => x.museum_ids)));
    const [museum] = museumIds.map(x => museumMap.get(x) ?? { id: x, title: `` });
    const capacities = Object.values(quota.capacities);
    const total_capacities = Object.values(quota.total_capacities);
    const total_tickets = total_capacities.reduce((a,b) => a+b, 0);
    const available_tickets = capacities.reduce((a,b) => a+b, 0);
    const bookParams = new URLSearchParams();
    if (museumIds[0]) bookParams.append('museum_id', `${museumIds[0]}`);
    bookParams.append('group', 'timeSlot');
    bookParams.append('date', date.toISOString().split('T')[0]);
    const firstTimeSlot = Object.entries(quota.capacities).find(x => x[1] > 0)?.[0];
    if (firstTimeSlot) bookParams.append('time', firstTimeSlot);
    return {
      museum: museum,
      tickets: tickets,
      slot_count: capacities.length,
      slot_size: total_capacities[0],
      total_tickets,
      available_tickets,
      book_url: `https://shop.museumssonntag.berlin/#/tickets/time?${bookParams}`,
    };
  });
}
