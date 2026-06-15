<?php
/**
 * Plugin Name: ServiceM8 Lead Webhook
 * Description: Sends WordPress form submissions to the Supabase webhook for the Lead Dashboard.
 * Version: 1.1.0
 *
 * Install: copy this file to wp-content/mu-plugins/lead-webhook.php
 * (create the mu-plugins folder if it does not exist).
 *
 * Configure in wp-config.php:
 *   define('LEAD_WEBHOOK_URL', 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/wordpress-webhook');
 *   define('LEAD_WEBHOOK_SECRET', 'YOUR_WORDPRESS_WEBHOOK_SECRET');
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!defined('LEAD_WEBHOOK_URL')) {
    define('LEAD_WEBHOOK_URL', '');
}

if (!defined('LEAD_WEBHOOK_SECRET')) {
    define('LEAD_WEBHOOK_SECRET', '');
}

/**
 * POST normalized submission data to the Supabase webhook API.
 *
 * @param array $payload
 * @return void
 */
function servicem8_send_lead_webhook(array $payload)
{
    if (!LEAD_WEBHOOK_URL || !LEAD_WEBHOOK_SECRET) {
        return;
    }

    $payload['submitted_at'] = gmdate('c');

    $headers = [
        'Content-Type' => 'application/json',
        'X-Webhook-Secret' => LEAD_WEBHOOK_SECRET,
    ];

    wp_remote_post(
        LEAD_WEBHOOK_URL,
        [
            'timeout' => 15,
            'headers' => $headers,
            'body' => wp_json_encode($payload),
        ]
    );
}

/**
 * Contact Form 7 — fires after mail is sent.
 */
add_action('wpcf7_mail_sent', function ($contact_form) {
    if (!class_exists('WPCF7_Submission')) {
        return;
    }

    $submission = WPCF7_Submission::get_instance();
    if (!$submission) {
        return;
    }

    $posted = $submission->get_posted_data();
    if (!is_array($posted)) {
        return;
    }

    servicem8_send_lead_webhook([
        'form_id' => $contact_form->id(),
        'form_title' => method_exists($contact_form, 'title') ? $contact_form->title() : '',
        'submission_id' => uniqid('cf7-', true),
        'fields' => array_map(
            static function ($value, $key) {
                return [
                    'name' => $key,
                    'value' => is_array($value) ? implode(', ', $value) : $value,
                ];
            },
            $posted,
            array_keys($posted)
        ),
        'full_name' => $posted['your-name'] ?? $posted['name'] ?? '',
        'email' => $posted['your-email'] ?? $posted['email'] ?? '',
        'phone' => $posted['your-phone'] ?? $posted['phone'] ?? $posted['tel'] ?? '',
        'message' => $posted['your-message'] ?? $posted['message'] ?? '',
        'service_requested' => $posted['service'] ?? $posted['subject'] ?? '',
        'raw_payload' => $posted,
    ]);
});

/**
 * WPForms — fires after entry is saved.
 */
add_action('wpforms_process_complete', function ($fields, $entry, $form_data) {
    $normalized = [
        'form_id' => $form_data['id'] ?? '',
        'form_title' => $form_data['settings']['form_title'] ?? '',
        'entry_id' => $entry['id'] ?? uniqid('wpforms-', true),
        'fields' => [],
    ];

    foreach ($fields as $field) {
        $normalized['fields'][] = [
            'name' => $field['name'] ?? $field['label'] ?? '',
            'value' => $field['value'] ?? '',
        ];
    }

    servicem8_send_lead_webhook($normalized);
}, 10, 3);

/**
 * Elementor Pro forms.
 */
add_action('elementor_pro/forms/new_record', function ($record, $handler) {
    $raw = $record->get('fields');
    $fields = [];

    foreach ($raw as $id => $field) {
        $fields[] = [
            'name' => $field['title'] ?? $field['id'] ?? $id,
            'value' => $field['value'] ?? '',
        ];
    }

    servicem8_send_lead_webhook([
        'form_id' => $handler->get_form_settings('id') ?? '',
        'form_title' => $handler->get_form_settings('form_name') ?? '',
        'submission_id' => uniqid('elementor-', true),
        'fields' => $fields,
    ]);
}, 10, 2);
