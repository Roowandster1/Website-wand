"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { contact, treatments } from "@/content/site";

type Status = "idle" | "sending" | "sent" | "error";

export default function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    // Spam bots fill in every field they find, including hidden ones.
    // A real person leaves this one empty, so anything here is junk —
    // we pretend it sent and quietly bin it.
    if (data.get("website")) {
      setStatus("sent");
      form.reset();
      return;
    }

    const name = String(data.get("name") ?? "");
    const email = String(data.get("email") ?? "");
    const phone = String(data.get("phone") ?? "");
    const enquiryAbout = String(data.get("about") ?? "");
    const message = String(data.get("message") ?? "");

    // No form service configured yet: fall back to opening the visitor's own
    // email app with everything already written out. Costs nothing and works.
    if (!contact.formEndpoint) {
      const body = [
        `Name: ${name}`,
        `Email: ${email}`,
        phone && `Phone: ${phone}`,
        enquiryAbout && `About: ${enquiryAbout}`,
        "",
        message,
      ]
        .filter(Boolean)
        .join("\n");

      window.location.href = `mailto:${contact.email}?subject=${encodeURIComponent(
        `Enquiry from ${name || "the website"}`,
      )}&body=${encodeURIComponent(body)}`;
      setStatus("sent");
      return;
    }

    setStatus("sending");
    try {
      const response = await fetch(contact.formEndpoint, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: data,
      });
      if (!response.ok) throw new Error(`Request failed: ${response.status}`);
      form.reset();
      setStatus("sent");
    } catch {
      setStatus("error");
    }
  }

  if (status === "sent") {
    return (
      <p className="form-status">
        Thank you — your message is on its way. I aim to reply within a day or
        two. If it&rsquo;s urgent, do please ring me on{" "}
        <a href={`tel:${contact.phoneLink}`}>{contact.phone}</a>.
      </p>
    );
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="name">Your name</label>
        <input id="name" name="name" type="text" autoComplete="name" required />
      </div>

      <div className="field">
        <label htmlFor="email">Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>

      <div className="field">
        <label htmlFor="phone">Phone number (optional)</label>
        <input id="phone" name="phone" type="tel" autoComplete="tel" />
      </div>

      <div className="field">
        <label htmlFor="about">What are you getting in touch about?</label>
        <select id="about" name="about" defaultValue="">
          <option value="">I&rsquo;m not sure yet</option>
          {treatments.map((t) => (
            <option key={t.slug} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="message">Message</label>
        <textarea
          id="message"
          name="message"
          required
          placeholder="A sentence or two is plenty. It helps to know roughly what times of day suit you."
        />
      </div>

      {/* Honeypot — hidden from people, irresistible to bots. */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
        <label htmlFor="website">Leave this field empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {status === "error" && (
        <p className="form-status" data-tone="error">
          Something went wrong sending that. Please email{" "}
          <a href={`mailto:${contact.email}`}>{contact.email}</a> or ring{" "}
          <a href={`tel:${contact.phoneLink}`}>{contact.phone}</a> instead.
        </p>
      )}

      <div>
        <button className="btn btn-primary" type="submit" disabled={status === "sending"}>
          {status === "sending" ? "Sending…" : "Send enquiry"}
        </button>
      </div>

      {/* The ICO expects the notice to be reachable at the point the data is
          collected, which is here rather than only in the footer. */}
      <p className="form-note">
        Your details are only ever used to reply to this enquiry.{" "}
        <Link href="/privacy">How I look after your information</Link>.
      </p>
    </form>
  );
}
