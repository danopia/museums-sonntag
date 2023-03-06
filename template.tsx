/** @jsx h */
import html, { Fragment, h, VNode } from "https://deno.land/x/htm@0.1.4/mod.ts";
import { Shop } from "./gomus-api.ts";

export function htmlResponse(shop: Shop, body: VNode) {
  return html({
    title: "Ticket Availability - Berlin Museum Sunday",
    body: (
      <div class="flex flex-col items-center justify-center w-full">
        <Header shop={shop} />
        {body}
        <Footer />
      </div>
    ),
  });
}

function Header(props: {
  shop: Shop;
}) {
  const ticketsFreeText = props.shop.content?.shop_tickets_global_free_field_text?.replaceAll(/<[^>]+>/g, '');
  return (<Fragment>
    <h1 class="mt-8 text-4xl font-bold">Berlin Museum Sunday</h1>
    <p class="mt-2 text-lg text-center text-gray-600">All ticket slots and current availability</p>

    {ticketsFreeText ? (
      <blockquote class="mt-4 m-2 pl-4 p-2 max-w-xl italic text-gray-700" style="border-left: 0.25em solid #999;">
        <p>{ticketsFreeText}</p>
      </blockquote>
    ) : []}
  </Fragment>);
}

function Footer() {
  return (
    <footer class="mt-8 bottom-8 pb-16 w-full h-6 flex items-center justify-center gap-2 text-gray-800">
      Data loaded from
      <a
        class="flex items-center gap-2 text-sm text-black no-underline font-semibold"
        href="https://gomus.de/"
      >
        <img alt="Deno" src="https://dash.deno.com/assets/logo.svg" class="w-5" style="display: none;" />
        go~mus public API
      </a>
    </footer>
  );
}
