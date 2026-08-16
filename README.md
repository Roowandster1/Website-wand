# Willow & Thyme — website

A small, fast website for a holistic therapy practice. Four pages: home,
treatments, about, and contact.

It's built with Next.js and exports to plain HTML, so it can be hosted free on
GitHub Pages, Netlify or Cloudflare Pages, and there's no server to maintain or
database to back up.

---

## Changing the words, prices and photos

**Everything you can change lives in one file: [`content/site.ts`](content/site.ts).**

Open it, edit the text between the `'quote marks'`, and save. You don't need to
touch anything else. That file covers:

| What you want to change              | Where in the file  |
| ------------------------------------ | ------------------ |
| Business name and tagline            | `site`             |
| Phone, email, address, social links  | `contact`          |
| Opening hours                        | `hours`            |
| Treatments, prices, descriptions     | `treatments`       |
| Client quotes                        | `testimonials`     |
| The About page and qualifications    | `about`            |
| The menu across the top              | `nav`              |

To **add** a treatment, copy an entire `{ ... }` block, paste it below, and
change the words. To **remove** one, delete its `{ ... }` block. The order in the
file is the order on the page.

Anything marked `‹‹ CHANGE ME ››` is placeholder text I made up so the site had
something to show. **Replace all of those before showing this to anyone.** The
business name, the therapist's name, the phone number, the address and the three
testimonials are all invented.

---

## Seeing it on your own computer

You need [Node.js](https://nodejs.org) installed (the "LTS" version is right).
Then, in a terminal, from this folder:

```bash
npm install     # once, the first time
npm run dev     # every time you want to work on it
```

Open http://localhost:3000. Leave it running — the page updates by itself each
time you save a change.

Press `Ctrl+C` in the terminal to stop it.

---

## Putting it online

```bash
npm run build
```

This writes a finished website into the `out/` folder. Every file in there is
plain HTML, CSS and images — you can drag that folder onto Netlify or Cloudflare
Pages and it will work.

### Automatically, via GitHub Pages

`.github/workflows/deploy.yml` is already set up. To turn it on:

1. On GitHub, go to **Settings → Pages**.
2. Under **Source**, choose **GitHub Actions**.

From then on, every push to `main` rebuilds and republishes the site within a
couple of minutes.

### A proper web address

Out of the box GitHub gives you an address like
`yourname.github.io/website-wand`. To use a real one:

1. Buy the domain (Namecheap, Gandi, Cloudflare — roughly £10–15 a year).
2. On GitHub, **Settings → Pages → Custom domain**, and follow its instructions.
3. Set `url` in `content/site.ts` to the new address, so Google and link
   previews point at the right place.

The deploy workflow handles the sub-folder difference automatically, so nothing
breaks when you switch.

---

## Making the contact form email her

Right now the enquiry form opens the visitor's own email app with their message
already filled in. That works, costs nothing, and needs no setup — but the
visitor has to press send in their own mail app, and some people won't.

To get enquiries emailed properly instead:

1. Sign up free at [formspree.io](https://formspree.io) and create a form.
2. Copy the URL it gives you (it looks like `https://formspree.io/f/abcdwxyz`).
3. Paste it into `formEndpoint` in `content/site.ts`.

The form switches over on its own — no other changes needed. The free tier
covers 50 enquiries a month.

---

## Adding photographs

Put image files in the `public/` folder, then refer to them as `/photo.jpg`.

Two things worth doing before you upload any picture: shrink it (anything wider
than about 2000 pixels is wasted, and slows the site down), and check you have
the right to use it. Photos of the actual room and the actual therapist beat
stock photography every time on a site like this — people are deciding whether
they'd feel comfortable in that room.

---

## A note on what's on the page

The copy mentions being insured and DBS checked, describes qualifications, and
makes claims about what treatments help with. Those are placeholders too.
Check every one against what's actually true before the site goes live —
particularly the qualifications and the "good for" tags, since claiming a
therapeutic benefit you can't stand behind is the kind of thing that causes real
trouble with the ASA and with insurers.

---

## Layout of the project

```
app/                 One folder per page
  page.tsx           Home
  treatments/        Treatments & prices
  about/             About
  contact/           Contact & booking form
  layout.tsx         The shell every page sits inside
  globals.css        All the styling, colours at the top
components/          Header, footer, contact form
content/site.ts      ← all the editable content
public/              Images go here
```

Colours, fonts and spacing are all defined as variables at the top of
`app/globals.css`. Change `--clay` there and the buttons, links and accents all
change together.
