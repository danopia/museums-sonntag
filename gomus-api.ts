export type MuseumPicture = {
  copyright_info: string;
  original: string;
  teaser_3x2: string;
  preview_3x2: string;
  detail_3x2: string;
  article_3x2: string;
};

export type Museum = {
  id: number;
  title: string;
  picture?: MuseumPicture;
};

export type Ticket = {
  id: number;
  ticket_type: "time_slot" | "annual";
  museum_ids: Array<number>;
  quota_ids: Array<number>;
  title: string;
  max_persons: number;
  entry_duration: number;
};

export class GomusApi {
  constructor(
    readonly shopUrl: string,
    readonly locale: "en" | "de",
  ) {}

  private async fetchJson(path: string, params: URLSearchParams) {
    const resp = await fetch(`https://kpb-museum.gomus.de/api${path}?${params}`, {
      "headers": {
        "accept": "application/json",
        "x-shop-url": this.shopUrl,
        "user-agent": `Deno/${Deno.version} (+https://museumssonntag.deno.dev)`,
      },
    });
    if (!resp.ok) throw new Error(`gomus returned HTTP ${resp.status}: ${await resp.text()}`);
    return await resp.json();
  }

  async getMuseumsPage() {
    const params = new URLSearchParams();
    params.set('locale', this.locale);
    params.set('per_page', '1000');

    const museumPage: {
      meta: { page: number; per_page: number; total_count: number; };
      museums: Array<Museum>;
    } = await this.fetchJson(`/v4/museums`, params);
    const museumMap = new Map(museumPage.museums.map(x => [x.id, x]));
    return museumMap;
  }

  async getTicketsPage(opts: {validAt?: Date}) {
    const params = new URLSearchParams();
    params.set('by_bookable', 'true');
    params.set('locale', this.locale);
    params.set('per_page', '1000');
    if (opts.validAt) params.set('valid_at', opts.validAt.toISOString().split('T')[0]);

    const ticketPage: {
      meta: { page: number; per_page: number; total_count: number; };
      tickets: Array<Ticket>;
    } = await this.fetchJson(`/v4/tickets`, params);
    const ticketMap = new Map(ticketPage.tickets.map(x => [x.id, x]));
    return ticketMap;
  }

  async getTicketCalendar(opts: {startDate?: Date, endDate?: Date}) {
    const params = new URLSearchParams();
    params.set('by_bookable', 'true');
    params.set('by_ticket_type', 'time_slot');
    if (opts.startDate) params.set('start_at', opts.startDate.toISOString().split('T')[0]);
    if (opts.endDate) params.set('end_at', opts.endDate.toISOString().split('T')[0]);

    const page: {
      data: Record<string,boolean>; // ISO date -> boolean
    } = await this.fetchJson(`/v4/tickets/calendar`, params);
    return Object.entries(page.data);
  }

  async getShop() {
    const params = new URLSearchParams();
    params.set('locale', this.locale);

    const shopPage: {
      shop: {
        name: string;
        translations: Record<string,string>;
        config: Record<string,unknown>;
        settings: Record<string,unknown>;
        content: {
          "shop_tickets_global_free_field_text"?: string;
        };
      };
    } = await this.fetchJson(`/v4/shop`, params);
    return shopPage.shop;
  }

  async getTicketCapacities(date: Date, ticketIds: number[]) {
    const params = new URLSearchParams();
    params.set('date', date.toISOString().split('T')[0]);

    for (const ticket of ticketIds) {
      params.append(`ticket_ids[]`, `${ticket}`);
    }

    const caps: {
      data: Record<string, {
        tickets:          Array<number>;
        capacities:       Record<string, number>;
        total_capacities: Record<string, number>;
      }>;
    } = await this.fetchJson(`/v4/tickets/capacities`, params);

    return caps.data;
  }
}
