<?php
/**
 * Plugin Name: Park Row Headless Rebuild Webhook
 * Description: Triggers the headless Netlify rebuild pipeline when WordPress content changes.
 */

if (!defined('PARKROW_HEADLESS_WEBHOOK_URL')) {
    define('PARKROW_HEADLESS_WEBHOOK_URL', 'https://your-site.netlify.app/wp-sync');
}

if (!defined('PARKROW_HEADLESS_WEBHOOK_SECRET')) {
    define('PARKROW_HEADLESS_WEBHOOK_SECRET', 'replace-with-the-same-secret-used-in-netlify');
}

if (!function_exists('parkrow_headless_dispatch_rebuild')) {
    function parkrow_headless_dispatch_rebuild($reason = 'content_changed', $payload = array(), $blocking = false) {
        if (empty(PARKROW_HEADLESS_WEBHOOK_URL) || empty(PARKROW_HEADLESS_WEBHOOK_SECRET)) {
            return new WP_Error(
                'parkrow_headless_missing_config',
                'Missing PARKROW_HEADLESS_WEBHOOK_URL or PARKROW_HEADLESS_WEBHOOK_SECRET.'
            );
        }

        if (!$blocking) {
            $lock_key = 'parkrow_headless_rebuild_lock';
            if (get_transient($lock_key)) {
                return true;
            }
            set_transient($lock_key, 1, 15);
        }

        $body = array_merge(
            array(
                'reason' => sanitize_key($reason),
                'site' => home_url('/'),
                'timestamp' => gmdate('c'),
            ),
            is_array($payload) ? $payload : array()
        );

        return wp_remote_post(
            PARKROW_HEADLESS_WEBHOOK_URL,
            array(
                'timeout' => 10,
                'blocking' => $blocking,
                'headers' => array(
                    'Content-Type' => 'application/json',
                    'X-WP-Webhook-Secret' => PARKROW_HEADLESS_WEBHOOK_SECRET,
                ),
                'body' => wp_json_encode($body),
            )
        );
    }
}

if (!function_exists('parkrow_headless_should_skip_post')) {
    function parkrow_headless_should_skip_post($post_id, $post) {
        if (!$post instanceof WP_Post) {
            return true;
        }

        if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) {
            return true;
        }

        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
            return true;
        }

        if (in_array($post->post_status, array('auto-draft', 'inherit'), true)) {
            return true;
        }

        if ('nav_menu_item' === $post->post_type) {
            return true;
        }

        return false;
    }
}

if (!function_exists('parkrow_headless_on_save_post')) {
    function parkrow_headless_on_save_post($post_id, $post, $update) {
        if (parkrow_headless_should_skip_post($post_id, $post)) {
            return;
        }

        parkrow_headless_dispatch_rebuild(
            $update ? 'post_updated' : 'post_created',
            array(
                'postId' => (int) $post_id,
                'postType' => (string) $post->post_type,
                'status' => (string) $post->post_status,
                'uri' => (string) get_permalink($post_id),
            )
        );
    }
}
add_action('save_post', 'parkrow_headless_on_save_post', 20, 3);

if (!function_exists('parkrow_headless_on_deleted_post')) {
    function parkrow_headless_on_deleted_post($post_id) {
        $post = get_post($post_id);

        parkrow_headless_dispatch_rebuild(
            'post_deleted',
            array(
                'postId' => (int) $post_id,
                'postType' => $post instanceof WP_Post ? (string) $post->post_type : '',
            )
        );
    }
}
add_action('deleted_post', 'parkrow_headless_on_deleted_post', 20, 1);

if (!function_exists('parkrow_headless_on_trashed_post')) {
    function parkrow_headless_on_trashed_post($post_id) {
        $post = get_post($post_id);

        if ($post instanceof WP_Post && 'nav_menu_item' === $post->post_type) {
            return;
        }

        parkrow_headless_dispatch_rebuild(
            'post_trashed',
            array(
                'postId' => (int) $post_id,
                'postType' => $post instanceof WP_Post ? (string) $post->post_type : '',
            )
        );
    }
}
add_action('trashed_post', 'parkrow_headless_on_trashed_post', 20, 1);

if (!function_exists('parkrow_headless_on_untrashed_post')) {
    function parkrow_headless_on_untrashed_post($post_id) {
        $post = get_post($post_id);

        if ($post instanceof WP_Post && 'nav_menu_item' === $post->post_type) {
            return;
        }

        parkrow_headless_dispatch_rebuild(
            'post_untrashed',
            array(
                'postId' => (int) $post_id,
                'postType' => $post instanceof WP_Post ? (string) $post->post_type : '',
            )
        );
    }
}
add_action('untrashed_post', 'parkrow_headless_on_untrashed_post', 20, 1);

if (!function_exists('parkrow_headless_on_menu_update')) {
    function parkrow_headless_on_menu_update($menu_id, $menu_data = array()) {
        parkrow_headless_dispatch_rebuild(
            'menu_updated',
            array(
                'menuId' => (int) $menu_id,
                'menuName' => !empty($menu_data['menu-name']) ? sanitize_text_field($menu_data['menu-name']) : '',
            )
        );
    }
}
add_action('wp_update_nav_menu', 'parkrow_headless_on_menu_update', 20, 2);

if (!function_exists('parkrow_headless_on_term_change')) {
    function parkrow_headless_on_term_change($term_id, $tt_id = 0, $taxonomy = '') {
        parkrow_headless_dispatch_rebuild(
            'term_changed',
            array(
                'termId' => (int) $term_id,
                'taxonomy' => (string) $taxonomy,
            )
        );
    }
}
add_action('created_term', 'parkrow_headless_on_term_change', 20, 3);
add_action('edited_term', 'parkrow_headless_on_term_change', 20, 3);

if (!function_exists('parkrow_headless_on_delete_term')) {
    function parkrow_headless_on_delete_term($term, $tt_id = 0, $taxonomy = '', $deleted_term = null) {
        parkrow_headless_dispatch_rebuild(
            'term_deleted',
            array(
                'termId' => (int) $term,
                'taxonomy' => (string) $taxonomy,
                'slug' => is_object($deleted_term) && !empty($deleted_term->slug) ? (string) $deleted_term->slug : '',
            )
        );
    }
}
add_action('delete_term', 'parkrow_headless_on_delete_term', 20, 4);

if (!function_exists('parkrow_headless_on_acf_save')) {
    function parkrow_headless_on_acf_save($post_id) {
        $post_id = (string) $post_id;

        if (0 !== strpos($post_id, 'options')) {
            return;
        }

        parkrow_headless_dispatch_rebuild(
            'acf_options_saved',
            array(
                'postId' => $post_id,
            )
        );
    }
}
add_action('acf/save_post', 'parkrow_headless_on_acf_save', 20, 1);

if (!function_exists('parkrow_headless_rest_permission')) {
    function parkrow_headless_rest_permission($request) {
        $provided = (string) $request->get_header('x-wp-webhook-secret');

        if (empty($provided)) {
            $authorization = (string) $request->get_header('authorization');
            if (0 === stripos($authorization, 'Bearer ')) {
                $provided = trim(substr($authorization, 7));
            }
        }

        return !empty(PARKROW_HEADLESS_WEBHOOK_SECRET) && hash_equals(PARKROW_HEADLESS_WEBHOOK_SECRET, $provided);
    }
}

add_action('rest_api_init', function () {
    register_rest_route(
        'parkrow/v1',
        '/rebuild',
        array(
            'methods' => WP_REST_Server::CREATABLE,
            'permission_callback' => 'parkrow_headless_rest_permission',
            'callback' => function ($request) {
                $params = $request->get_json_params();
                $params = is_array($params) ? $params : array();
                $reason = !empty($params['reason']) ? sanitize_key($params['reason']) : 'manual';
                $response = parkrow_headless_dispatch_rebuild($reason, $params, true);

                if (is_wp_error($response)) {
                    return new WP_REST_Response(
                        array(
                            'ok' => false,
                            'message' => $response->get_error_message(),
                        ),
                        500
                    );
                }

                $status = (int) wp_remote_retrieve_response_code($response);
                if ($status < 100) {
                    $status = 202;
                }

                return new WP_REST_Response(
                    array(
                        'ok' => $status >= 200 && $status < 300,
                        'status' => $status,
                        'body' => wp_remote_retrieve_body($response),
                    ),
                    $status
                );
            },
        )
    );
});
