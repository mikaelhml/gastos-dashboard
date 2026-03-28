# Research Summary

## What Changed In This Adjustment

The original GSD research was useful for brainstorming, but it was too speculative in places and drifted beyond the scope the user actually approved.

This adjusted research narrows the milestone back to the selected v1 and keeps recommendations grounded in the current repo.

## Current v1 Focus

The approved v1 is:
- safe reimport and stronger duplicate protection
- full JSON backup and restore for the whole dataset
- category trends across months
- SCR/Registrato affecting real projection output
- editable categorization rules plus correction memory

## Main Conclusion

The existing stack is sufficient for the selected v1.

No mandatory stack migration is needed right now. The safest path is to implement the approved scope inside the current architecture with additive helper modules and, if needed, one small new store for categorization rules.

## Recommended Order Of Work

1. **Data safety first**
   - fix reimport scope issues
   - improve duplicate handling
   - ship full backup/restore

2. **Analytics second**
   - compute monthly category trends from existing loaded data
   - show month-over-month movement clearly

3. **Projection integration third**
   - move SCR/Registrato-derived commitments from informational context into real projection behavior
   - explain what part of projection is inferred

4. **Smart categorization fourth**
   - add user rules
   - persist manual correction memory
   - keep user-defined rules ahead of defaults

## Biggest Risks

- data loss or silent deletion during reimport
- building analytics on top of inaccurate categorization
- overengineering the stack before the approved v1 is shipped
- changing projection behavior without enough UI explanation

## Stack Guidance In One Line

Stay on the current stack for this milestone unless a real, demonstrated limitation forces a targeted addition.

## Later Candidates, Not Current Requirements

Revisit later only if needed:
- import diagnostics expansion
- budget vs actual UI
- free-text transaction search
- automatic installment tracking
- privacy audit screen
- OCR fallback
- richer charting/export libraries

## Planning Takeaway

For this repo, the best GSD planning inputs are:
- the approved v1 requirements
- the verified codebase concerns
- a bias toward additive changes over stack churn
