<script lang="ts">
  export let title = '';
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
</script>

<div class="modal-backdrop" on:click={() => dispatch('close')} on:keydown={() => dispatch('close')} role="presentation">
  <div class="modal" on:click|stopPropagation on:keydown|stopPropagation role="dialog" aria-modal="true">
    {#if title}<h3>{title}</h3>{/if}
    <slot />
  </div>
</div>
