"""Builds samples/demo_pack.json: a small hand-written sample course (intro mechanics) that
exercises every FinalForge feature without an API key. The "past papers" here are sample
questions written for the demo, not real exam papers.

    python samples/build_demo.py
"""
from __future__ import annotations

import json
import math
from pathlib import Path

G = 9.8


def step(kind, prompt, answer_type, *, choices=(), correct=(), num=None, tol=1, unit="", text="",
         hint="", expl="", cids=()):
    return {"kind": kind, "prompt_md": prompt, "answer_type": answer_type, "choices": list(choices),
            "correct_choices": list(correct), "numeric_answer": num, "tolerance_pct": tol if answer_type == "numeric" else None,
            "unit": unit, "text_answer_md": text, "hint_md": hint, "explanation_md": expl, "concept_ids": list(cids)}


def problem(pid, pattern_id, source, ref, title, statement, parts):
    for pi, part in enumerate(parts):
        for si, s in enumerate(part["steps"]):
            s["id"] = f"{pid}-{pi}-{si}"
    return {"id": pid, "pattern_id": pattern_id, "source": source, "source_ref": ref, "title": title,
            "statement_md": statement, "parts": parts, "verified": True, "verify_note": ""}


def part(label, prompt, marks, final, steps):
    return {"label": label, "prompt_md": prompt, "marks": marks, "final_answer_md": final, "steps": steps}


PROJ = ["c-suvat", "c-projectile-motion"]
INC = ["c-newtons-second-law", "c-free-body-diagrams", "c-friction-incline"]


# ------------------------------------------------------------------ projectile problems

def projectile(pid, source, ref, title, obj, verb, place, u, h):
    t = math.sqrt(2 * h / G)
    x = u * t
    vy = G * t
    v = math.sqrt(u * u + vy * vy)
    statement = (f"A {obj} is {verb} **horizontally** at ${u:g}\\ \\text{{m s}}^{{-1}}$ from the top of a {place} "
                 f"${h:g}\\ \\text{{m}}$ high. Air resistance is negligible. Take $g = 9.8\\ \\text{{m s}}^{{-2}}$.\n\n"
                 f"(a) Calculate the time the {obj} takes to reach the ground. **(3 marks)**\n\n"
                 f"(b) Calculate the horizontal distance it travels. **(2 marks)**\n\n"
                 f"(c) Calculate its speed just before it hits the ground. **(3 marks)**\n\n"
                 f"(d) Explain why {verb.replace('kicked', 'kicking').replace('thrown', 'throwing')} it faster would **not** change your answer to (a). **(2 marks)**")
    given = [f"Horizontal launch speed $u_x = {u:g}$ m/s", f"Height $h = {h:g}$ m", "$g = 9.8$ m/s²",
             "Initial vertical velocity $u_y = 0$", f"Initial vertical velocity $u_y = {u:g}$ m/s",
             f"Mass of the {obj}", "Time of flight"]
    parts = [
        part("a", "Time to reach the ground", "3", f"$t \\approx {t:.2f}\\ \\text{{s}}$", [
            step("given", "Which of these does the question give you (directly or by its wording)? Select all.", "multi",
                 choices=given, correct=[0, 1, 2, 3],
                 hint="\"Horizontally\" is information too: what does it say about the starting vertical velocity?",
                 expl=f"Given: $u_x={u:g}$, $h={h:g}$, $g=9.8$. The word *horizontally* tells you $u_y = 0$. Mass and time are **not** given (and mass is never needed).",
                 cids=PROJ),
            step("concept", "Which motion decides how long the object is in the air?", "choice",
                 choices=["The vertical motion only", "The horizontal motion only", "Both combined into one speed", "The mass of the object"],
                 correct=[0], hint="What has to happen for the flight to end? It has to *fall* 45 m... or whatever the height is.",
                 expl="The flight ends when the object has fallen the full height. Falling is vertical motion, controlled only by $u_y$, $g$ and $h$.",
                 cids=PROJ),
            step("formula", "Which SUVAT equation links $s$, $u$, $a$ and $t$ (no $v$)?", "choice",
                 choices=["$s = ut + \\tfrac12 a t^2$", "$v = u + at$", "$v^2 = u^2 + 2as$", "$s = \\tfrac{(u+v)}{2}t$"],
                 correct=[0], hint="You know $s$, $u$, $a$ and want $t$. You don't know the final vertical velocity $v$.",
                 expl="With $u_y = 0$: $h = \\tfrac12 g t^2$.", cids=["c-suvat"]),
            step("rearrange", "With $u_y = 0$, rearrange $h = \\tfrac12 g t^2$ for $t$.", "choice",
                 choices=["$t = \\sqrt{2h/g}$", "$t = 2h/g$", "$t = \\sqrt{h/(2g)}$", "$t = h/u_x$"],
                 correct=[0], hint="Multiply both sides by 2, divide by $g$, then undo the square.",
                 expl="$2h = g t^2 \\Rightarrow t^2 = 2h/g \\Rightarrow t = \\sqrt{2h/g}$.", cids=["c-suvat"]),
            step("compute", "Compute $2h/g$ (the value under the square root).", "numeric", num=2 * h / G, unit="s²",
                 hint=f"$2 \\times {h:g} \\div 9.8$", expl=f"$2h/g = {2 * h:g}/9.8 = {2 * h / G:.3f}\\ \\text{{s}}^2$", cids=["c-suvat"]),
            step("final", "So what is the time of flight $t$?", "numeric", num=t, unit="s",
                 hint="Square-root your previous answer.", expl=f"$t = \\sqrt{{{2 * h / G:.3f}}} = {t:.3f}\\ \\text{{s}}$", cids=PROJ),
        ]),
        part("b", "Horizontal distance", "2", f"$x \\approx {x:.1f}\\ \\text{{m}}$", [
            step("concept", "What is the horizontal acceleration during the flight?", "choice",
                 choices=["$0$: no horizontal force (air resistance negligible)", "$9.8\\ \\text{m s}^{-2}$", "$-9.8\\ \\text{m s}^{-2}$", f"${u:g}\\ \\text{{m s}}^{{-2}}$"],
                 correct=[0], hint="Gravity pulls which way?", expl="Gravity is vertical. Horizontally nothing pushes or pulls, so $u_x$ stays constant.",
                 cids=["c-projectile-motion"]),
            step("formula", "Which formula gives the horizontal distance?", "choice",
                 choices=["$x = u_x t$", "$x = \\tfrac12 g t^2$", "$x = u_x t + \\tfrac12 g t^2$", "$x = u_x / t$"],
                 correct=[0], hint="Constant speed: distance = speed × time.", expl="Constant velocity, so $x = u_x t$.",
                 cids=["c-projectile-motion"]),
            step("final", "Calculate the horizontal distance $x$.", "numeric", num=x, unit="m",
                 hint=f"${u:g} \\times t$ using your $t$ from (a).", expl=f"$x = {u:g} \\times {t:.3f} = {x:.2f}\\ \\text{{m}}$", cids=PROJ),
        ]),
        part("c", "Impact speed", "3", f"$v \\approx {v:.1f}\\ \\text{{m s}}^{{-1}}$", [
            step("compute", "Find the vertical velocity $v_y$ just before impact.", "numeric", num=vy, unit="m/s",
                 hint="$v_y = u_y + g t$ with $u_y = 0$.", expl=f"$v_y = 9.8 \\times {t:.3f} = {vy:.2f}\\ \\text{{m s}}^{{-1}}$ (or $v_y^2 = 2gh$).",
                 cids=["c-suvat"]),
            step("concept", "How do you combine the two velocity components into a speed?", "choice",
                 choices=["$v = \\sqrt{v_x^2 + v_y^2}$", "$v = v_x + v_y$", "$v = v_y$ only", "$v = \\sqrt{v_y^2 - v_x^2}$"],
                 correct=[0], hint="The components are at right angles, like the two short sides of a right triangle.",
                 expl="Perpendicular components add by Pythagoras.", cids=["c-projectile-motion"]),
            step("final", "Calculate the impact speed $v$.", "numeric", num=v, unit="m/s",
                 hint=f"$\\sqrt{{{u:g}^2 + v_y^2}}$", expl=f"$v = \\sqrt{{{u * u:g} + {vy * vy:.1f}}} = {v:.2f}\\ \\text{{m s}}^{{-1}}$", cids=PROJ),
            step("check", "Sanity check: the impact speed must be…", "choice",
                 choices=[f"bigger than both {u:g} and {vy:.1f} m/s", f"between {u:g} and {vy:.1f} m/s", f"smaller than {u:g} m/s", f"exactly {u + vy:.1f} m/s"],
                 correct=[0], hint="The hypotenuse of a right triangle vs its two sides.",
                 expl="A hypotenuse is longer than either side but shorter than their sum.", cids=["c-projectile-motion"]),
        ]),
        part("d", "Explain", "2", "Vertical and horizontal motion are independent; time depends only on $h$ and $g$.", [
            step("explain", "Explain why launching faster does not change the time of flight.", "text",
                 text="- Horizontal and vertical motions are **independent** (perpendicular). (1)\n- The time is set by the vertical motion only: $u_y = 0$, $h$ and $g$ are unchanged, so $t = \\sqrt{2h/g}$ is unchanged. (1)",
                 hint="Which quantities appear in $t = \\sqrt{2h/g}$? Does $u_x$?",
                 expl="Marks go for (1) independence of components and (2) time depends only on vertical quantities, which are unchanged.",
                 cids=["c-projectile-motion"]),
        ]),
    ]
    return problem(pid, "p-horizontal-projectile", source, ref, title, statement, parts)


# ------------------------------------------------------------------ incline problems

def incline(pid, source, ref, title, m, deg, mu, dist):
    th = math.radians(deg)
    N = m * G * math.cos(th)
    along = m * G * math.sin(th)
    F = mu * N
    a = (along - F) / m
    v = math.sqrt(2 * a * dist)
    statement = (f"A block of mass ${m:g}\\ \\text{{kg}}$ is released from rest on a rough plane inclined at ${deg:g}^\\circ$ "
                 f"to the horizontal. The coefficient of friction between the block and the plane is ${mu:g}$. "
                 f"Take $g = 9.8\\ \\text{{m s}}^{{-2}}$.\n\n"
                 f"(a) Identify the forces acting on the block. **(2 marks)**\n\n"
                 f"(b) Calculate the normal reaction force. **(2 marks)**\n\n"
                 f"(c) Calculate the acceleration of the block down the plane. **(4 marks)**\n\n"
                 f"(d) Calculate the speed of the block after it has slid ${dist:g}\\ \\text{{m}}$. **(2 marks)**")
    parts = [
        part("a", "Forces on the block", "2", "Weight (down), normal reaction (perpendicular to the plane), friction (up the slope).", [
            step("given", "What does the question give you? Select all.", "multi",
                 choices=[f"$m = {m:g}$ kg", f"$\\theta = {deg:g}^\\circ$", f"$\\mu = {mu:g}$", "Starts from rest, $u = 0$",
                          "The plane is smooth", "A pushing force on the block", f"$\\mu = {mu + 0.1:g}$"],
                 correct=[0, 1, 2, 3], hint="\"Released from rest\" and \"rough\" are information.",
                 expl="Rough = friction acts. Released from rest = $u = 0$. Nothing pushes it.", cids=INC),
            step("concept", "Which forces act on the block as it slides down? Select all.", "multi",
                 choices=["Weight $mg$, vertically down", "Normal reaction, perpendicular to the plane",
                          "Friction, up the slope", "Friction, down the slope", "\"The force of motion\" down the slope", "Centripetal force"],
                 correct=[0, 1, 2], hint="Friction always opposes the sliding. Is there anything *touching* the block besides the plane?",
                 expl="Only three forces: weight, normal reaction, and friction opposing motion (so up the slope). \"Force of motion\" doesn't exist: motion needs no force to continue.",
                 cids=["c-free-body-diagrams", "c-friction-incline"]),
        ]),
        part("b", "Normal reaction", "2", f"$R \\approx {N:.1f}\\ \\text{{N}}$", [
            step("formula", "Resolving perpendicular to the plane, the normal reaction is…", "choice",
                 choices=["$R = mg\\cos\\theta$", "$R = mg\\sin\\theta$", "$R = mg$", "$R = mg/\\cos\\theta$"],
                 correct=[0], hint="No acceleration perpendicular to the plane, so forces balance in that direction. Which component of weight points into the plane?",
                 expl="Perpendicular to the slope: $R - mg\\cos\\theta = 0$.", cids=["c-free-body-diagrams", "c-friction-incline"]),
            step("final", "Calculate $R$.", "numeric", num=N, unit="N",
                 hint=f"${m:g} \\times 9.8 \\times \\cos {deg:g}^\\circ$ (calculator in degrees!)",
                 expl=f"$R = {m:g} \\times 9.8 \\times {math.cos(th):.4f} = {N:.2f}\\ \\text{{N}}$", cids=["c-friction-incline"]),
        ]),
        part("c", "Acceleration", "4", f"$a \\approx {a:.2f}\\ \\text{{m s}}^{{-2}}$", [
            step("compute", "Component of the weight acting down the slope, $mg\\sin\\theta$:", "numeric", num=along, unit="N",
                 hint=f"${m:g} \\times 9.8 \\times \\sin {deg:g}^\\circ$", expl=f"$mg\\sin\\theta = {along:.2f}\\ \\text{{N}}$", cids=["c-free-body-diagrams"]),
            step("compute", "Friction force $F = \\mu R$:", "numeric", num=F, unit="N",
                 hint=f"${mu:g} \\times R$", expl=f"$F = {mu:g} \\times {N:.2f} = {F:.2f}\\ \\text{{N}}$", cids=["c-friction-incline"]),
            step("formula", "Newton's second law along the slope (down = positive):", "choice",
                 choices=["$ma = mg\\sin\\theta - \\mu R$", "$ma = mg\\sin\\theta + \\mu R$", "$ma = mg\\cos\\theta - \\mu R$", "$ma = \\mu R$"],
                 correct=[0], hint="Resultant force = (force pulling down the slope) − (force resisting).",
                 expl="Resultant force down the slope is $mg\\sin\\theta - F$, and it equals $ma$.", cids=["c-newtons-second-law", "c-friction-incline"]),
            step("final", "Calculate the acceleration $a$.", "numeric", num=a, unit="m/s²",
                 hint="(down-slope component − friction) ÷ mass", expl=f"$a = ({along:.2f} - {F:.2f})/{m:g} = {a:.3f}\\ \\text{{m s}}^{{-2}}$",
                 cids=["c-newtons-second-law"]),
        ]),
        part("d", f"Speed after {dist:g} m", "2", f"$v \\approx {v:.2f}\\ \\text{{m s}}^{{-1}}$", [
            step("formula", "Which equation links $u$, $v$, $a$ and $s$ (no $t$)?", "choice",
                 choices=["$v^2 = u^2 + 2as$", "$v = u + at$", "$s = ut + \\tfrac12at^2$", "$v = s/t$"],
                 correct=[0], hint="You don't know the time.", expl="$v^2 = u^2 + 2as$ with $u = 0$.", cids=["c-suvat"]),
            step("final", "Calculate $v$.", "numeric", num=v, unit="m/s",
                 hint=f"$v = \\sqrt{{2 \\times a \\times {dist:g}}}$", expl=f"$v = \\sqrt{{2 \\times {a:.3f} \\times {dist:g}}} = {v:.2f}\\ \\text{{m s}}^{{-1}}$",
                 cids=["c-suvat"]),
        ]),
    ]
    return problem(pid, "p-block-on-incline", source, ref, title, statement, parts)


def braking(pid, source, ref, title, u, s):
    a = -u * u / (2 * s)
    t = -u / a
    statement = (f"A car travelling at ${u:g}\\ \\text{{m s}}^{{-1}}$ brakes with uniform deceleration and comes to rest in "
                 f"${s:g}\\ \\text{{m}}$.\n\n(a) Calculate the deceleration. **(3 marks)**\n\n(b) Calculate the time taken to stop. **(2 marks)**")
    parts = [
        part("a", "Deceleration", "3", f"$a = {a:.2f}\\ \\text{{m s}}^{{-2}}$ (deceleration ${-a:.2f}\\ \\text{{m s}}^{{-2}}$)", [
            step("given", "Match the question to SUVAT. Which values are known? Select all.", "multi",
                 choices=[f"$u = {u:g}$ m/s", "$v = 0$", f"$s = {s:g}$ m", "$t$", "$a$"], correct=[0, 1, 2],
                 hint="\"Comes to rest\" gives you one of them.", expl="$u$, $v=0$ (rest) and $s$ are known; $a$ and $t$ are not.", cids=["c-suvat"]),
            step("formula", "Which equation uses $u$, $v$, $s$ and $a$ only?", "choice",
                 choices=["$v^2 = u^2 + 2as$", "$v = u + at$", "$s = ut + \\tfrac12at^2$", "$s = \\tfrac{u+v}{2}t$"], correct=[0],
                 hint="Pick the one without $t$.", expl="$0 = u^2 + 2as$.", cids=["c-suvat"]),
            step("final", "Calculate $a$ (include the sign).", "numeric", num=a, unit="m/s²",
                 hint=f"$a = -u^2/(2s)$", expl=f"$a = -{u * u:g}/(2 \\times {s:g}) = {a:.2f}\\ \\text{{m s}}^{{-2}}$; negative because it slows down.",
                 cids=["c-acceleration", "c-suvat"]),
        ]),
        part("b", "Stopping time", "2", f"$t = {t:.2f}\\ \\text{{s}}$", [
            step("formula", "Quickest equation for $t$ now?", "choice",
                 choices=["$v = u + at$", "$v^2 = u^2 + 2as$", "$t = s/u$", "$t = u/s$"], correct=[0],
                 hint="You now know $a$.", expl="$t = (v-u)/a$.", cids=["c-suvat"]),
            step("final", "Calculate $t$.", "numeric", num=t, unit="s",
                 hint=f"$(0 - {u:g})/a$", expl=f"$t = -{u:g}/({a:.2f}) = {t:.2f}\\ \\text{{s}}$. Check: average speed ${u / 2:g}$ m/s × {t:.2f} s = {s:g} m ✓",
                 cids=["c-suvat"]),
        ]),
    ]
    return problem(pid, "p-braking-suvat", source, ref, title, statement, parts)


# ------------------------------------------------------------------ concepts

def concept(cid, name, topic, one, prereq, related, importance, detail):
    return {"id": cid, "name": name, "topic_id": topic, "one_liner": one, "prerequisites": prereq, "related": related,
            "importance": importance, "source_refs": ["demo notes"], "exam_frequency": 0, "detail": detail}


def det(why, what, how, analogy, visual, steps, formulas, spot, traps, tips, example, check, svg=""):
    return {"why_exists_md": why, "what_it_does_md": what, "how_it_works_md": how, "everyday_analogy_md": analogy,
            "visualize_md": visual, "diagram_svg": svg,
            "atomic_steps": [{"step_md": s, "everyday_link": e} for s, e in steps],
            "formulas": [{"latex": l, "name": n, "meaning_md": m, "symbols": [{"symbol": a, "meaning": b, "unit": c} for a, b, c in sy], "when_to_use_md": w}
                         for l, n, m, sy, w in formulas],
            "patterns_to_spot": [{"cue": c, "signals_md": s} for c, s in spot],
            "common_traps": [{"trap_md": t, "fix_md": f} for t, f in traps],
            "tips_tricks": [{"tip_md": t, "source": s} for t, s in tips],
            "mini_example_md": example, "self_check": check}


PROJ_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" font-family="sans-serif" font-size="12"><rect x="10" y="40" width="50" height="150" fill="none" stroke="#4b5563" stroke-width="2"/><path d="M60 40 Q 170 50 250 190" fill="none" stroke="#6366f1" stroke-width="3" stroke-dasharray="6 4"/><line x1="60" y1="40" x2="110" y2="40" stroke="#4b5563" stroke-width="2" marker-end="url(#a)"/><defs><marker id="a" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#4b5563"/></marker></defs><text x="68" y="32" fill="#4b5563">u_x (stays the same)</text><line x1="210" y1="120" x2="210" y2="160" stroke="#6366f1" stroke-width="2" marker-end="url(#a)"/><text x="216" y="146" fill="#6366f1">v_y grows</text><text x="16" y="120" fill="#4b5563">h</text><line x1="10" y1="190" x2="310" y2="190" stroke="#4b5563"/><text x="120" y="185" fill="#4b5563">x = u_x t</text></svg>"""

INC_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" font-family="sans-serif" font-size="12"><defs><marker id="b" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L6,3 L0,6 z" fill="#4b5563"/></marker></defs><path d="M20 180 L300 180 L20 40 z" fill="none" stroke="#4b5563" stroke-width="2"/><g transform="rotate(26.6 140 100)"><rect x="115" y="76" width="50" height="30" fill="#eef0ff" stroke="#6366f1" stroke-width="2"/></g><line x1="140" y1="100" x2="140" y2="165" stroke="#4b5563" stroke-width="2" marker-end="url(#b)"/><text x="145" y="165" fill="#4b5563">mg</text><line x1="140" y1="95" x2="115" y2="45" stroke="#6366f1" stroke-width="2" marker-end="url(#b)"/><text x="88" y="45" fill="#6366f1">R</text><line x1="140" y1="95" x2="95" y2="73" stroke="#d97706" stroke-width="2" marker-end="url(#b)"/><text x="60" y="80" fill="#d97706">F = μR</text><text x="255" y="172" fill="#4b5563">θ</text></svg>"""

CONCEPTS = [
    concept("c-displacement-velocity", "Displacement & velocity", "t-kinematics",
            "Velocity is how fast your position changes, and in which direction.", [], ["c-acceleration"], "supporting", det(
        "Saying \"I walked 5 km\" doesn't tell anyone where you ended up. To predict *where* something will be, we need distance **with direction** (displacement) and speed **with direction** (velocity).",
        "Lets you describe exactly where an object goes and how quickly its position changes.\n\n**In one sentence:** velocity = how much your position changes each second, including which way.",
        "1. Pick a starting point and a positive direction.\n2. Displacement $s$ = final position − starting position (can be negative).\n3. Velocity = displacement ÷ time: $v = s/t$ for steady motion.",
        "Walking to the school gate and back: you walked 400 m (distance) but your displacement is 0, because you're back where you started. Your *average velocity* over the round trip is 0 even though your legs are tired.",
        "Draw a number line. An arrow from start to finish is the displacement. The arrow's length per second is the velocity.",
        [("Choose a positive direction.", "decide \"towards school is +\""), ("Measure where you started.", "the front door"),
         ("Measure where you ended.", "the school gate"), ("Subtract: end − start = displacement.", "how far the gate is from the door"),
         ("Divide by time taken = average velocity.", "metres per second of walking")],
        [("v = \\frac{s}{t}", "Average velocity", "Displacement per unit time.", [("v", "velocity", "m/s"), ("s", "displacement", "m"), ("t", "time", "s")],
          "Steady motion, or for the *average* velocity. Not for changing speeds at an instant.")],
        [("\"returns to its starting point\"", "Displacement is zero."), ("\"in which direction\" / \"velocity\"", "Give a sign or a direction with your answer.")],
        [("Mixing up distance and displacement.", "Ask: does the direction matter here? If yes → displacement.")],
        [("Always state your positive direction at the top of your working.", "general")],
        "A runner goes 300 m east in 60 s then 100 m west in 40 s. Displacement $= 300 - 100 = 200$ m east; average velocity $= 200/100 = 2$ m/s east.",
        ["What's the difference between distance and displacement?", "Can velocity be negative? What does that mean?"])),

    concept("c-acceleration", "Acceleration", "t-kinematics",
            "Acceleration is how fast your velocity changes each second.", ["c-displacement-velocity"], ["c-newtons-second-law"], "core", det(
        "Things don't just move at one speed: cars speed up, balls slow down. We need a number for **how quickly velocity changes**, or we can't predict anything that speeds up or slows down.",
        "Tells you how many m/s of velocity are added (or removed) every second.\n\n**In one sentence:** acceleration = change in velocity ÷ time taken.",
        "If velocity goes from $u$ to $v$ in time $t$, the change is $v-u$; spreading it evenly over $t$ seconds gives $a = (v-u)/t$. Negative $a$ means velocity is decreasing in the positive direction (slowing down if you're moving forwards).",
        "Pocket money: if your savings go from \\$10 to \\$40 in 3 weeks, they grow by \\$10 *per week*. Acceleration is the same thing for velocity: how many m/s you gain *per second*.",
        "Picture a speedometer needle. Acceleration is how fast the needle moves, not where it points.",
        [("Note the starting velocity $u$.", "savings at the start"), ("Note the final velocity $v$.", "savings at the end"),
         ("Find the change $v - u$.", "how much you gained"), ("Divide by the time taken.", "gain per week"), ("Keep the sign: negative = slowing (if moving +).", "spending, not saving")],
        [("a = \\frac{v-u}{t}", "Acceleration", "Change of velocity per second.", [("a", "acceleration", "m/s²"), ("u", "initial velocity", "m/s"), ("v", "final velocity", "m/s"), ("t", "time", "s")],
          "Constant acceleration, or the average acceleration over an interval.")],
        [("\"brakes\", \"decelerates\", \"slows down uniformly\"", "Negative acceleration in the direction of motion."), ("\"comes to rest\" / \"from rest\"", "$v = 0$ or $u = 0$.")],
        [("Thinking zero velocity means zero acceleration.", "A ball at the top of its throw has $v = 0$ but $a = g$ downwards."),
         ("Dropping the minus sign for deceleration.", "Write $a$ with its sign; say \"deceleration of 6.25 m/s²\" only in words.")],
        [("Units check: m/s divided by s = m/s².", "general")],
        "A car goes from 10 m/s to 25 m/s in 5 s: $a = (25-10)/5 = 3\\ \\text{m s}^{-2}$.",
        ["Can something have zero velocity and non-zero acceleration?", "What does a negative acceleration mean?"])),

    concept("c-suvat", "Constant-acceleration equations (SUVAT)", "t-kinematics",
            "Five linked quantities (s, u, v, a, t): know three, find the other two.", ["c-acceleration"], ["c-projectile-motion"], "core", det(
        "Exam questions give you a few facts about a motion and ask for something else. Without a toolkit linking them, you'd have to reason from scratch every time.",
        "Four equations that connect displacement $s$, initial velocity $u$, final velocity $v$, acceleration $a$ and time $t$, valid whenever $a$ is constant.\n\n**In one sentence:** list what you know, pick the equation that's missing the one you don't care about.",
        "Each equation leaves out exactly one of the five quantities. Write down the three you know and the one you want; the fifth (unused) letter tells you which equation to pick.",
        "Like a recipe card where any 3 ingredients tell you the other 2: if you know how many cookies, how many per tray, and how long each tray takes, you can work out the total time.",
        "Draw a 5-box table: s | u | v | a | t. Fill in what you know, put ? in the one you want, and a ✗ in the one you neither know nor need.",
        [("Choose a positive direction.", "\"down the hill is +\""), ("Write s, u, v, a, t in a column.", "a shopping list"),
         ("Fill in the known values with signs.", "tick what's in the fridge"), ("Mark the unknown you want with ?.", "what you need to buy"),
         ("Cross out the quantity that is neither known nor wanted.", "what the recipe doesn't use"),
         ("Pick the equation without the crossed-out letter.", "choose the recipe card"), ("Substitute and solve.", "cook")],
        [("v = u + at", "No s", "", [("v", "final velocity", "m/s"), ("u", "initial velocity", "m/s"), ("a", "acceleration", "m/s²"), ("t", "time", "s")], "When $s$ is not involved."),
         ("s = ut + \\tfrac12 a t^2", "No v", "", [("s", "displacement", "m")], "When $v$ is not involved, e.g. time to fall from rest."),
         ("v^2 = u^2 + 2as", "No t", "", [], "When time is not involved, e.g. braking distance."),
         ("s = \\tfrac{(u+v)}{2}t", "No a", "", [], "When acceleration is not involved.")],
        [("\"uniform / constant acceleration\", \"freely falling\"", "SUVAT applies."), ("\"from rest\"", "$u = 0$"), ("\"comes to rest\"", "$v = 0$")],
        [("Using SUVAT when acceleration changes.", "Check the word *constant/uniform* or that only gravity acts."),
         ("Mixing signs (up +, but $g$ entered as +9.8).", "Decide the positive direction once and apply it to every vector.")],
        [("The ✗ trick: the equation without the unwanted letter is always the one.", "demo paper 2023 Q2"), ("Check $t$ with average speed: $s = \\frac{u+v}{2}t$.", "general")],
        "A car at 25 m/s stops in 50 m. Known: $u = 25$, $v = 0$, $s = 50$; want $a$; ✗ = $t$ → $v^2 = u^2 + 2as$ → $a = -625/100 = -6.25\\ \\text{m s}^{-2}$.",
        ["Which equation would you use if time isn't mentioned?", "Why must acceleration be constant?"])),

    concept("c-projectile-motion", "Projectile motion", "t-kinematics",
            "Split the flight into two independent motions: steady sideways, accelerating downwards.", ["c-suvat"], ["c-suvat"], "core", det(
        "A thrown ball moves sideways and falls at the same time: one curved path that looks hard. Splitting it into two simple straight-line motions makes it solvable with SUVAT.",
        "Lets you find time of flight, range and impact velocity of anything thrown or launched, ignoring air resistance.\n\n**In one sentence:** horizontal = constant speed, vertical = free fall, and the clock is shared.",
        "Gravity only pulls **down**, so it only changes vertical velocity. Horizontal velocity stays constant. Solve the vertical motion (usually to get $t$), then use that same $t$ horizontally.",
        "Roll a marble off a table while your friend drops one from the same height at the same moment: they hit the floor together. The sideways roll doesn't make the fall slower or faster. The floor is the \"timer\", and only falling matters for it.",
        "Imagine the shadow of the ball on the ground (moves steadily) and its shadow on a wall (falls faster and faster). The real ball is just both shadows at once.",
        [("Split velocity into horizontal $u_x$ and vertical $u_y$.", "two separate shadows"), ("Horizontal: $a = 0$, so $x = u_x t$.", "the floor shadow glides steadily"),
         ("Vertical: $a = g$ downwards, use SUVAT.", "the wall shadow falls like a dropped stone"), ("Find $t$ from the vertical motion.", "the floor is the timer"),
         ("Use the same $t$ in the horizontal equation.", "both shadows share one clock"), ("Recombine components with Pythagoras for speed.", "diagonal of a rectangle")],
        [("t = \\sqrt{2h/g}", "Fall time from rest (horizontal launch)", "From $h = \\tfrac12 g t^2$ with $u_y = 0$.", [("h", "height", "m"), ("g", "gravitational field strength", "m/s²")], "Only when launched horizontally (u_y = 0)."),
         ("x = u_x t", "Horizontal distance", "Constant horizontal velocity.", [("x", "horizontal distance", "m"), ("u_x", "horizontal velocity", "m/s")], "Always, if air resistance is negligible."),
         ("v = \\sqrt{v_x^2 + v_y^2}", "Speed from components", "", [], "Impact speed questions.")],
        [("\"projected / thrown / kicked horizontally\"", "$u_y = 0$; time comes from height only."), ("\"lands\", \"hits the ground\"", "Vertical displacement equals the height."),
         ("\"speed just before impact\"", "Find both components then Pythagoras.")],
        [("Using the launch speed in the vertical equation.", "For a horizontal launch, $u_y = 0$."), ("Thinking a faster throw stays in the air longer.", "Time depends only on vertical motion."),
         ("Adding components directly ($v_x + v_y$).", "They're perpendicular: use Pythagoras.")],
        [("For horizontal launches you can skip time for impact speed: $v_y^2 = 2gh$.", "demo paper 2023 Q1"), ("Write two columns, H and V, every time.", "general")],
        "Kicked horizontally at 12 m/s from 45 m: $t = \\sqrt{90/9.8} = 3.03$ s; $x = 12 \\times 3.03 = 36.4$ m.",
        ["Why doesn't the horizontal speed change?", "What decides the time of flight?", "How do you get the impact speed?"], PROJ_SVG)),

    concept("c-newtons-second-law", "Newton's second law", "t-forces",
            "Resultant force = mass × acceleration: forces change motion, they don't maintain it.", ["c-acceleration"], ["c-free-body-diagrams"], "core", det(
        "People once thought you need a force to keep things moving. Newton showed forces **change** motion. We need a law that says exactly how much a force changes velocity.",
        "Links the resultant (net) force on an object to its acceleration: $F = ma$.\n\n**In one sentence:** the more unbalanced the push, and the lighter the object, the faster its velocity changes.",
        "Add all forces as vectors to get the resultant force. That resultant, and only that, causes acceleration in its direction: $a = F_{\\text{net}}/m$. Balanced forces → zero acceleration (constant velocity, possibly zero).",
        "Pushing an empty shopping trolley vs a full one with the same push: the empty one speeds up much faster. Two friends pushing equally from opposite sides: it doesn't move (forces cancel, resultant zero).",
        "Draw the object as a dot with force arrows. Imagine the arrows playing tug-of-war; the leftover arrow after cancelling is $ma$.",
        [("Identify every force on the object.", "everyone pushing the trolley"), ("Pick a positive direction.", "\"forwards is +\""),
         ("Add forces with signs to get the resultant.", "who wins the tug-of-war, by how much"), ("Set resultant = $ma$.", "leftover push makes it speed up"),
         ("Solve for the unknown.", "")],
        [("F_{\\text{net}} = ma", "Newton's second law", "Resultant force equals mass times acceleration.", [("F_{\\text{net}}", "resultant force", "N"), ("m", "mass", "kg"), ("a", "acceleration", "m/s²")],
          "Any time forces and acceleration appear together. Apply it along one direction at a time.")],
        [("\"resultant force\", \"net force\", \"accelerates\"", "Use $F_{net} = ma$."), ("\"moves at constant velocity\"", "Resultant force is zero.")],
        [("Using one force instead of the resultant.", "Always sum *all* forces along the direction first."), ("Thinking moving objects need a forward force.", "Constant velocity needs zero resultant force.")],
        [("Resolve along the direction of acceleration and perpendicular to it.", "demo paper 2023 Q3")],
        "A 2 kg trolley is pushed with 10 N against 4 N friction: $F_{net} = 6$ N, $a = 6/2 = 3\\ \\text{m s}^{-2}$.",
        ["What does a zero resultant force tell you about the motion?", "Which force goes into $F = ma$?"])),

    concept("c-free-body-diagrams", "Free-body diagrams & resolving", "t-forces",
            "Draw the object alone with every force on it, then split forces along useful directions.", [], ["c-newtons-second-law"], "supporting", det(
        "Real situations have many things touching and pulling. A free-body diagram strips it down to *one object and the forces on it*, so you don't forget or invent forces.",
        "Lists every force on one object and lets you resolve them into components along chosen axes.\n\n**In one sentence:** isolate, draw arrows, choose axes, split diagonal arrows.",
        "Draw the object as a box. Add weight (down), contact forces (normal reaction perpendicular to each surface, friction along it), and tensions/pushes. On a slope choose axes along and perpendicular to the slope; resolve weight into $mg\\sin\\theta$ (along) and $mg\\cos\\theta$ (into the slope).",
        "Like listing who is touching you in a crowd: only people actually in contact (plus gravity pulling everyone) can push you. Nobody far away counts.",
        "Tilt your head to make the slope look flat: then the weight arrow is the only one that looks \"slanted\", so it's the only one you need to split.",
        [("Draw the object alone as a box.", "cut it out of the picture"), ("Draw weight $mg$ straight down.", "gravity pulls everyone"),
         ("Draw normal reaction perpendicular to the surface.", "the floor pushing back"), ("Draw friction along the surface, opposing sliding.", "rubbing slows you"),
         ("Choose axes along and perpendicular to the motion.", "tilt your head"), ("Resolve forces that aren't on an axis.", "split the slanted arrow")],
        [("mg\\sin\\theta", "Weight component along slope", "", [("\\theta", "slope angle", "°")], "Slope problems: down-slope pull."),
         ("mg\\cos\\theta", "Weight component into slope", "", [], "Slope problems: balances the normal reaction.")],
        [("\"inclined plane\", \"slope at θ°\"", "Axes along/perpendicular to the slope; resolve weight."), ("\"identify the forces\"", "Weight, normal reaction, friction (+ any rope/push).")],
        [("Adding a \"force of motion\".", "Only things touching it (plus gravity) exert forces."), ("Swapping sin and cos.", "As θ → 0 (flat), the along-slope part must → 0, so it's sin.")],
        [("Check sin/cos with θ = 0: flat ground means no down-slope pull.", "general")],
        "On a 30° slope, a 5 kg block: along $= 5 \\times 9.8 \\times \\sin 30° = 24.5$ N; into slope $= 42.4$ N.",
        ["Which forces act on a block sliding down a rough slope?", "How can you check sin vs cos quickly?"], INC_SVG)),

    concept("c-friction-incline", "Friction on an inclined plane", "t-forces",
            "Friction opposes sliding with size μR, where R = mg cos θ on a slope.", ["c-newtons-second-law", "c-free-body-diagrams"], ["c-free-body-diagrams"], "core", det(
        "Real slopes are rough: blocks slide slower than on ice. We need a model for how big that resistance is.",
        "Gives the friction force $F = \\mu R$ (sliding) and combines with Newton's second law to find accelerations on rough slopes.\n\n**In one sentence:** friction = roughness × how hard the surfaces press together.",
        "The harder two surfaces press ($R$), and the rougher they are ($\\mu$), the bigger the friction. On a slope, $R = mg\\cos\\theta$, so $F = \\mu mg\\cos\\theta$, acting up the slope for a block sliding down. Then $ma = mg\\sin\\theta - \\mu mg\\cos\\theta$.",
        "Sliding down a playground slide in shorts vs in rubber boots: boots = bigger μ. A heavier kid presses harder (bigger R), so more friction, but also more pull down the slope, so mass cancels!",
        "Picture the slide surface: friction is a hand on the block pushing back up the slide, with strength μ × (how hard the slide pushes back).",
        [("Find $R = mg\\cos\\theta$.", "how hard the slide pushes on you"), ("Multiply by $\\mu$ to get friction.", "boots vs shorts"),
         ("Point friction opposite to the sliding.", "the hand pushes back"), ("Find the down-slope pull $mg\\sin\\theta$.", "steepness of the slide"),
         ("Resultant = pull − friction.", "who wins"), ("Divide by $m$ for $a$.", "how fast you speed up")],
        [("F = \\mu R", "Sliding friction", "", [("\\mu", "coefficient of friction", "—"), ("R", "normal reaction", "N")], "When the object slides (or is about to)."),
         ("a = g(\\sin\\theta - \\mu\\cos\\theta)", "Acceleration down a rough slope", "Mass cancels.", [], "Released block sliding down; check $\\tan\\theta > \\mu$ for it to slide.")],
        [("\"rough plane\", \"coefficient of friction\"", "$F = \\mu R$ with $R$ from resolving perpendicular."), ("\"released from rest\"", "$u = 0$; friction acts up the slope.")],
        [("Using $R = mg$ on a slope.", "Resolve: $R = mg\\cos\\theta$."), ("Friction pointing down the slope for a block sliding down.", "Friction opposes the motion.")],
        [("Mass cancels in $a = g(\\sin\\theta - \\mu\\cos\\theta)$: a quick check of your answer.", "demo paper 2023 Q3"), ("Calculator in DEGREES mode!", "general")],
        "5 kg, 30°, μ = 0.2: $a = 9.8(\\sin 30° - 0.2\\cos 30°) = 3.20\\ \\text{m s}^{-2}$.",
        ["Why does the mass cancel?", "Which way does friction act on a block sliding down?"])),
]


def mcq(qid, cids, qtype, q, options, correct, expl, diff=2):
    return {"id": qid, "concept_ids": cids, "type": qtype, "question_md": q, "options": options, "correct": correct,
            "option_explanations": expl, "difficulty": diff}


MCQS = [
    mcq("q-dv-1", ["c-displacement-velocity"], "intuition", "You jog one full lap of a 400 m track in 100 s. What is your average velocity?",
        ["0 m/s", "4 m/s", "400 m/s", "It depends on your mass"],
        0, ["Right: you end where you started, so displacement is 0.", "That's average *speed* (distance/time), not velocity.", "Units and size are off.", "Mass has nothing to do with velocity."]),
    mcq("q-dv-2", ["c-displacement-velocity"], "misconception", "Which statement is true?",
        ["Velocity can be negative; speed cannot", "Speed and velocity are always equal", "Displacement is always larger than distance", "Velocity has no direction"],
        0, ["Velocity carries direction (sign); speed is its size.", "Only for straight-line motion in the + direction.", "Displacement is never larger than distance.", "Direction is what makes it velocity."]),
    mcq("q-acc-1", ["c-acceleration"], "intuition", "A ball is thrown straight up. At the very top, its velocity is zero. Its acceleration there is…",
        ["9.8 m/s² downwards", "zero", "9.8 m/s² upwards", "infinite"],
        0, ["Gravity never switches off; it keeps changing the velocity.", "Classic trap: v = 0 doesn't mean a = 0, or it would stay up there forever.", "Gravity pulls down.", "No."], 2),
    mcq("q-acc-2", ["c-acceleration"], "application", "A bike goes from 2 m/s to 8 m/s in 3 s. Its acceleration is…",
        ["2 m/s²", "6 m/s²", "3.3 m/s²", "18 m/s²"], 0,
        ["(8 − 2)/3 = 2.", "That's the change in velocity, not per second.", "That's 10/3: you added instead of subtracting.", "You multiplied."]),
    mcq("q-acc-3", ["c-acceleration", "c-newtons-second-law"], "map", "Which idea do you need in order to connect forces to changes in motion?",
        ["Acceleration", "Displacement only", "Distance travelled", "Average speed"], 0,
        ["F = ma: force links to motion through acceleration.", "Displacement alone says nothing about forces.", "Distance doesn't connect to force directly.", "Average speed doesn't either."]),
    mcq("q-suvat-1", ["c-suvat"], "pattern", "\"A car travelling at 20 m/s brakes uniformly and stops in 40 m. Find the deceleration.\" Which equation goes first?",
        ["$v^2 = u^2 + 2as$", "$v = u + at$", "$s = ut + \\tfrac12at^2$", "$F = ma$"], 0,
        ["No time is given or wanted: use the equation without $t$.", "Needs $t$, which you don't have.", "Needs $t$ too.", "No forces or mass given."]),
    mcq("q-suvat-2", ["c-suvat"], "misconception", "When can you use the SUVAT equations?",
        ["Only when acceleration is constant", "For any motion at all", "Only when the object starts from rest", "Only for vertical motion"], 0,
        ["They're derived assuming constant $a$.", "Changing acceleration breaks them.", "$u$ can be anything.", "They work in any straight line."]),
    mcq("q-suvat-3", ["c-suvat"], "intuition", "Two balls are dropped from rest; one falls for 2 s, the other for 4 s. The second falls…",
        ["4 times as far", "2 times as far", "the same distance", "8 times as far"], 0,
        ["$s = \\tfrac12gt^2$: doubling $t$ quadruples $s$.", "Distance isn't proportional to time when accelerating.", "No.", "That would be $t^3$."]),
    mcq("q-proj-1", ["c-projectile-motion"], "intuition", "You roll a marble off a table and at the same instant drop another from the same height. Which lands first?",
        ["They land together", "The rolled marble", "The dropped marble", "Depends on the marbles' masses"], 0,
        ["Vertical motion is identical (u_y = 0, same h, same g).", "Sideways speed doesn't change the fall.", "Same fall for both.", "Mass doesn't affect free fall (no air resistance)."]),
    mcq("q-proj-2", ["c-projectile-motion"], "misconception", "During a projectile's flight (no air resistance), the horizontal velocity…",
        ["stays constant", "decreases steadily", "increases steadily", "becomes zero at the top"], 0,
        ["No horizontal force → no horizontal acceleration.", "Only if air resistance acts.", "Nothing pushes it sideways.", "That's the vertical velocity (for an upward launch)."]),
    mcq("q-proj-3", ["c-projectile-motion", "c-suvat"], "pattern", "\"A stone is thrown horizontally from a 20 m cliff…\" To find the time of flight, use…",
        ["The vertical motion with $u_y = 0$", "The horizontal motion with the throw speed", "Pythagoras on the two speeds", "Energy conservation only"], 0,
        ["Time is set by falling 20 m.", "Horizontal motion doesn't set the time.", "That gives impact speed, not time.", "Possible for speed, not for time."]),
    mcq("q-n2-1", ["c-newtons-second-law"], "misconception", "A hockey puck slides across smooth ice at constant velocity. The resultant force on it is…",
        ["zero", "in the direction of motion", "opposite to the motion", "equal to its weight"], 0,
        ["Constant velocity = zero acceleration = zero resultant force.", "No force is needed to *keep* moving.", "That would slow it down.", "Weight is balanced by the normal reaction."]),
    mcq("q-n2-2", ["c-newtons-second-law"], "application", "A 4 kg box is pushed with 20 N against 8 N of friction. Its acceleration is…",
        ["3 m/s²", "5 m/s²", "7 m/s²", "2 m/s²"], 0,
        ["(20 − 8)/4 = 3.", "20/4: you forgot friction.", "(20 + 8)/4: friction opposes, subtract it.", "8/4: wrong force."]),
    mcq("q-fbd-1", ["c-free-body-diagrams"], "misconception", "A block slides down a rough slope. Which force does NOT act on it?",
        ["A \"force of motion\" down the slope", "Weight", "Normal reaction", "Friction"], 0,
        ["There's no such force; motion continues without a force.", "Always acts.", "The slope pushes back.", "Rough → friction."]),
    mcq("q-fbd-2", ["c-free-body-diagrams"], "intuition", "On a slope of angle θ, the component of weight pulling the block DOWN the slope is $mg\\sin\\theta$. Quick check?",
        ["At θ = 0 (flat) it must be zero, and sin 0 = 0", "At θ = 0 it must equal mg", "At θ = 90° it must be zero", "There is no quick check"], 0,
        ["Flat ground doesn't pull you sideways, so the formula must vanish at 0.", "On flat ground nothing pulls you along.", "On a vertical wall, all of the weight is along it.", "Limiting cases are the quick check."]),
    mcq("q-fi-1", ["c-friction-incline"], "application", "Block on a 30° slope, μ = 0.2. Normal reaction for a 5 kg block (g = 9.8)?",
        ["42.4 N", "49 N", "24.5 N", "9.8 N"], 0,
        ["$5 \\times 9.8 \\times \\cos30°$.", "That's $mg$: you forgot to resolve.", "That's $mg\\sin30°$.", "No."]),
    mcq("q-fi-2", ["c-friction-incline"], "intuition", "Two identical-material blocks, 1 kg and 10 kg, are released on the same rough slope. Which accelerates faster?",
        ["Same acceleration", "The 10 kg block", "The 1 kg block", "Neither moves"], 0,
        ["$a = g(\\sin\\theta - \\mu\\cos\\theta)$: no $m$ in it.", "More pull, but also more friction, in the same ratio.", "Mass cancels.", "If tan θ > μ they slide."]),
    mcq("q-fi-3", ["c-friction-incline", "c-newtons-second-law"], "pattern", "\"Released from rest on a rough plane inclined at 25°… find the acceleration.\" The first equation you write is…",
        ["$R = mg\\cos\\theta$ (resolve perpendicular)", "$v^2 = u^2 + 2as$", "$F = mg$", "$s = ut + \\tfrac12at^2$"], 0,
        ["You need $R$ before you can get friction $\\mu R$.", "That's for later parts (speed after a distance).", "Not a real relation here.", "Kinematics comes after you have $a$."]),
]

GUIDED = {
    "c-projectile-motion": [
        {"question_md": "You drop a ball from your hand. Which way does gravity pull it?", "options": ["Straight down", "Forwards", "Backwards", "Nowhere"],
         "correct": 0, "explanation_md": "Gravity always pulls straight **down**."},
        {"question_md": "Now you throw the ball sideways. Does gravity pull it sideways at all?", "options": ["No, still only down", "Yes, forwards", "Yes, backwards", "It switches off"],
         "correct": 0, "explanation_md": "Gravity doesn't care how you threw it: still only down."},
        {"question_md": "If nothing pushes the ball sideways (no air resistance), what happens to its sideways speed?", "options": ["Stays the same", "Slowly drops", "Grows", "Becomes zero"],
         "correct": 0, "explanation_md": "No sideways force → no sideways acceleration → constant sideways speed."},
        {"question_md": "So does throwing it sideways change how fast it falls?", "options": ["No: falling is a separate motion", "Yes, it falls slower", "Yes, it falls faster", "It doesn't fall"],
         "correct": 0, "explanation_md": "**This is projectile motion:** two independent motions, sideways at constant speed and downwards like a dropped ball, sharing one clock."},
    ],
    "c-newtons-second-law": [
        {"question_md": "Same push on an empty trolley and a full one. Which speeds up faster?", "options": ["The empty one", "The full one", "Same", "Neither moves"],
         "correct": 0, "explanation_md": "Less mass → bigger change of speed for the same push."},
        {"question_md": "Two friends push one trolley equally hard from opposite sides. What happens?", "options": ["It doesn't speed up", "It speeds up", "It shoots upwards", "It gets heavier"],
         "correct": 0, "explanation_md": "The pushes cancel: the **resultant** force is zero."},
        {"question_md": "So what decides the acceleration?", "options": ["The leftover (resultant) force and the mass", "Only the biggest single force", "Only the mass", "The speed"],
         "correct": 0, "explanation_md": "**Newton's second law:** $F_{net} = ma$. Resultant force, divided by mass, gives acceleration."},
    ],
}


def build() -> dict:
    problems = [
        projectile("p-horizontal-projectile-1", "past_paper", "demo Q1 (2023)", "Ball kicked from a cliff", "ball", "kicked", "cliff", 12, 45),
        projectile("p-horizontal-projectile-2", "past_paper", "demo Q1 (2022)", "Stone thrown from a bridge", "stone", "thrown", "bridge", 8, 20),
        projectile("p-horizontal-projectile-3", "variant", "variant of demo Q1 (2023)", "Parcel thrown from a rooftop", "parcel", "thrown", "building", 15, 30),
        incline("p-block-on-incline-1", "past_paper", "demo Q3 (2023)", "Block on a rough 30° slope", 5, 30, 0.2, 3),
        incline("p-block-on-incline-2", "past_paper", "demo Q3 (2022)", "Crate on a rough 25° ramp", 2, 25, 0.15, 4),
        incline("p-block-on-incline-3", "variant", "variant of demo Q3 (2023)", "Box on a rough 35° roof", 3, 35, 0.3, 2.5),
        braking("p-braking-suvat-1", "past_paper", "demo Q2 (2023)", "Car braking to rest", 25, 50),
        braking("p-braking-suvat-2", "variant", "variant of demo Q2 (2023)", "Train braking to rest", 30, 225),
    ]
    sq = lambda num, label, p: {"material_id": "demo", "number": num, "text_md": p["statement_md"], "marks": "", "solution_md": "",
                               "material_label": label, "is_exam": True}
    patterns = [
        {"id": "p-horizontal-projectile", "name": "Horizontal launch from a height", "calc": True,
         "description": "Something leaves a height horizontally; find time of flight, range, impact speed, and explain independence.",
         "concept_ids": ["c-suvat", "c-projectile-motion"], "frequency": 2,
         "source_questions": [sq("1", "Demo final 2023", problems[0]), sq("1", "Demo final 2022", problems[1])],
         "guide": {
             "recognition_cues": ["\"thrown / kicked / projected **horizontally**\"", "a height (cliff, table, bridge) is given", "asks for time, horizontal distance or impact speed"],
             "recipe": [
                 {"step_md": "Write two columns: **H** (horizontal) and **V** (vertical).", "why_md": "The motions are independent.", "everyday_link": "two shadows of the ball"},
                 {"step_md": "V: $u_y = 0$, $a = g$, $s = h$.", "why_md": "\"Horizontally\" means no vertical launch speed.", "everyday_link": "like dropping it"},
                 {"step_md": "Find $t$ from $h = \\tfrac12 g t^2$.", "why_md": "Time is set by the fall.", "everyday_link": "the floor is the timer"},
                 {"step_md": "H: $x = u_x t$.", "why_md": "No horizontal acceleration.", "everyday_link": "steady glide"},
                 {"step_md": "Impact: $v_y = gt$ (or $\\sqrt{2gh}$), then $v = \\sqrt{u_x^2 + v_y^2}$.", "why_md": "Perpendicular components.", "everyday_link": "diagonal of a rectangle"},
                 {"step_md": "Sanity-check: $v$ is bigger than both components.", "why_md": "Catches Pythagoras slips.", "everyday_link": "hypotenuse is longest"},
             ],
             "tricks": ["$v_y^2 = 2gh$ gives impact vertical speed without finding $t$.", "Mass never appears: if you're using it, stop."],
             "traps": ["Putting the launch speed into the vertical equation.", "Adding $v_x + v_y$ instead of Pythagoras.", "Forgetting to square-root at the end."],
             "examiner_wants_md": "Equation quoted before substitution, $u_y = 0$ stated, units on every answer, 3 s.f. For the *explain* part: independence of components **and** time depends only on vertical quantities.",
         }},
        {"id": "p-block-on-incline", "name": "Block on a rough incline", "calc": True,
         "description": "A block on a rough slope: identify forces, find normal reaction, acceleration, then speed after a distance.",
         "concept_ids": ["c-free-body-diagrams", "c-friction-incline", "c-newtons-second-law", "c-suvat"], "frequency": 2,
         "source_questions": [sq("3", "Demo final 2023", problems[3]), sq("3", "Demo final 2022", problems[4])],
         "guide": {
             "recognition_cues": ["\"rough plane inclined at θ\"", "\"coefficient of friction\"", "\"released from rest\""],
             "recipe": [
                 {"step_md": "Draw the free-body diagram: $mg$, $R$, friction up the slope.", "why_md": "Can't sum forces you haven't drawn.", "everyday_link": "list who touches it"},
                 {"step_md": "Resolve perpendicular: $R = mg\\cos\\theta$.", "why_md": "No acceleration into the slope.", "everyday_link": "the slope pushes back"},
                 {"step_md": "Friction: $F = \\mu R$.", "why_md": "Sliding friction model.", "everyday_link": "boots vs shorts"},
                 {"step_md": "Resolve along: $ma = mg\\sin\\theta - F$.", "why_md": "Newton's second law along the motion.", "everyday_link": "tug-of-war leftover"},
                 {"step_md": "Solve for $a$, then use SUVAT for later parts.", "why_md": "Constant force → constant $a$.", "everyday_link": "recipe card"},
             ],
             "tricks": ["$a = g(\\sin\\theta - \\mu\\cos\\theta)$: mass cancels, a quick check.", "Calculator in degrees."],
             "traps": ["$R = mg$ (forgot to resolve).", "Friction drawn down the slope.", "Swapping sin and cos."],
             "examiner_wants_md": "A labelled force diagram, resolving shown in both directions, $F = \\mu R$ quoted, answers to 3 s.f. with units.",
         }},
        {"id": "p-braking-suvat", "name": "Uniform braking / accelerating vehicle", "calc": True,
         "description": "A vehicle speeds up or slows uniformly: find acceleration, time or distance with SUVAT.",
         "concept_ids": ["c-acceleration", "c-suvat"], "frequency": 1,
         "source_questions": [sq("2", "Demo final 2023", problems[6])],
         "guide": {
             "recognition_cues": ["\"uniformly\", \"constant deceleration\"", "\"comes to rest\" / \"from rest\""],
             "recipe": [
                 {"step_md": "List s, u, v, a, t with signs.", "why_md": "See what you have.", "everyday_link": "shopping list"},
                 {"step_md": "Cross out the one not given and not wanted.", "why_md": "It picks the equation.", "everyday_link": "skip the missing ingredient"},
                 {"step_md": "Use the equation without that letter.", "why_md": "Each equation omits one.", "everyday_link": "pick the recipe card"},
                 {"step_md": "Check with average speed: $s = \\frac{u+v}{2}t$.", "why_md": "Quick independent check.", "everyday_link": "halfway speed"},
             ],
             "tricks": ["Deceleration answers carry a minus sign as $a$; state the magnitude in words."],
             "traps": ["Using $v = 0$ as $u$.", "Dropping the sign of $a$."],
             "examiner_wants_md": "SUVAT list shown, equation quoted, sign of acceleration interpreted.",
         }},
    ]
    kn = {
        "version": 1,
        "course": {"title": "Physics 101 (demo): Motion & Forces",
                   "overview_md": "**This is a sample course** written to show how FinalForge works; its \"past papers\" are sample questions, not real exams.\n\n"
                                  "The course tells one story: first we learn to **describe** motion (displacement → velocity → acceleration → the SUVAT toolkit → projectiles), "
                                  "then we learn what **causes** changes in motion (Newton's second law, free-body diagrams, friction on slopes).\n\n"
                                  "The sample final has 3 recurring question types: a **horizontal projectile** (≈ 10 marks), a **block on a rough slope** (≈ 10 marks) and a **uniform braking** problem (≈ 5 marks)."},
        "topics": [{"id": "t-kinematics", "name": "Describing motion (kinematics)", "summary": "Where things are, how fast, and how that changes."},
                   {"id": "t-forces", "name": "Forces & Newton's laws", "summary": "Why motion changes."}],
        "concepts": CONCEPTS,
        "patterns": patterns,
        "mcqs": MCQS,
        "guided": GUIDED,
        "problems": problems,
        "learning_path": ["c-displacement-velocity", "c-acceleration", "c-suvat", "c-projectile-motion", "c-newtons-second-law", "c-free-body-diagrams", "c-friction-incline"],
        "uncovered_questions": [],
        "generated_at": None,
        "model": "hand-written demo",
    }
    # exam_frequency per concept, as the pipeline computes it
    for c in kn["concepts"]:
        c["exam_frequency"] = sum(len(p["source_questions"]) for p in patterns if c["id"] in p["concept_ids"])
    return {"format": "finalforge-pack", "version": 1, "name": "Physics 101 (demo)",
            "description": "Sample course: every feature, no API key needed", "knowledge": kn}


if __name__ == "__main__":
    out = Path(__file__).with_name("demo_pack.json")
    out.write_text(json.dumps(build(), ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"wrote {out}")
