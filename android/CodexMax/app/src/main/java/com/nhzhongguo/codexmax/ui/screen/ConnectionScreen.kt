package com.nhzhongguo.codexmax.ui.screen

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanIntentResult
import com.journeyapps.barcodescanner.ScanOptions
import com.nhzhongguo.codexmax.R
import com.nhzhongguo.codexmax.BuildConfig
import com.nhzhongguo.codexmax.ScanActivity
import com.nhzhongguo.codexmax.ui.state.ConnectionStateViewModel
import com.nhzhongguo.codexmax.ui.theme.Background
import com.nhzhongguo.codexmax.ui.theme.Divider
import com.nhzhongguo.codexmax.ui.theme.Primary
import com.nhzhongguo.codexmax.ui.theme.Secondary
import com.nhzhongguo.codexmax.ui.theme.Success
import com.nhzhongguo.codexmax.ui.theme.SurfaceAlt
import com.nhzhongguo.codexmax.ui.theme.SurfaceDeep
import com.nhzhongguo.codexmax.ui.theme.TextTertiary

@Composable
fun ConnectionScreen(
    viewModel: ConnectionStateViewModel,
    onLanguageToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

    val scanner = rememberLauncherForActivityResult(
        contract = ScanContract(),
        onResult = { result: ScanIntentResult ->
            val contents = result.contents
            if (!contents.isNullOrEmpty()) viewModel.connect(contents)
        },
    )

    val notificationPermission = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission(),
        onResult = { granted ->
            if (!granted) viewModel.showSnackbar(
                context.getString(R.string.notification_permission_denied)
            )
        },
    )

    LaunchedEffect(Unit) {
        if (viewModel.shouldRequestNotificationPermission()) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 20.dp, vertical = 28.dp),
    ) {
        // ---- Header ----
        ConnectionHeader(onLanguageToggle = onLanguageToggle)

        Spacer(modifier = Modifier.height(32.dp))

        // ---- Hero ----
        Text(
            text = stringResource(R.string.mobile_hero_title),
            style = MaterialTheme.typography.displayLarge,
            lineHeight = 38.sp,
        )

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = stringResource(R.string.mobile_hero_subtitle),
            style = MaterialTheme.typography.bodyMedium,
            lineHeight = 20.sp,
        )

        Spacer(modifier = Modifier.height(26.dp))

        // ---- Scan card ----
        ScanCard(
            onScanClick = {
                if (viewModel.hasCamera()) {
                    val options = ScanOptions()
                        .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                        .setPrompt(context.getString(R.string.scan_prompt))
                        .setBeepEnabled(false)
                        .setOrientationLocked(true)
                        .setCaptureActivity(ScanActivity::class.java)
                    scanner.launch(options)
                } else {
                    viewModel.showSnackbar(context.getString(R.string.camera_unavailable))
                }
            },
        )

        Spacer(modifier = Modifier.height(14.dp))

        // ---- Manual connect card ----
        ManualConnectCard(
            addressInput = state.addressInput,
            onAddressChange = viewModel::updateAddressInput,
            onConnectClick = { viewModel.connect(state.addressInput) },
            hasRecent = state.hasRecent,
            onRecentClick = viewModel::connectRecent,
            onRecentLongClick = viewModel::clearRecent,
        )

        // ---- Status ----
        if (state.showStatus) {
            Spacer(modifier = Modifier.height(14.dp))
            StatusBanner(
                message = state.statusMessage,
                isError = state.statusIsError,
            )
        }

        Spacer(modifier = Modifier.height(14.dp))

        // ---- Health card ----
        HealthCard(
            online = state.serverOnline,
            version = BuildConfig.VERSION_NAME,
        )

        Spacer(modifier = Modifier.height(14.dp))

        // ---- Tips card ----
        TipsCard()

        Spacer(modifier = Modifier.height(18.dp))

        Text(
            text = stringResource(R.string.local_mode),
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun ConnectionHeader(onLanguageToggle: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth(),
    ) {
        // Icon tile
        Box(
            modifier = Modifier
                .size(54.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(SurfaceAlt)
                .padding(9.dp),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Outlined.Public,
                contentDescription = stringResource(R.string.app_name),
                tint = Primary,
                modifier = Modifier.size(28.dp),
            )
        }

        Spacer(modifier = Modifier.width(14.dp))

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = stringResource(R.string.app_name),
                style = MaterialTheme.typography.headlineMedium,
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = stringResource(R.string.app_subtitle),
                style = MaterialTheme.typography.labelSmall,
                color = TextTertiary,
            )
        }

        // Language toggle
        TextButton(
            onClick = onLanguageToggle,
            modifier = Modifier
                .clip(RoundedCornerShape(16.dp))
                .background(SurfaceAlt),
            contentPadding = PaddingValues(
                horizontal = 10.dp,
                vertical = 4.dp,
            ),
        ) {
            Text(
                text = stringResource(R.string.language_toggle),
                style = MaterialTheme.typography.labelSmall,
                color = Primary,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}

@Composable
private fun ScanCard(onScanClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(SurfaceAlt)
            .padding(18.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = stringResource(R.string.mobile_scan_card_title),
                    style = MaterialTheme.typography.titleLarge,
                )
                Spacer(modifier = Modifier.height(5.dp))
                Text(
                    text = stringResource(R.string.mobile_scan_card_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
            // Ready badge
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(16.dp))
                    .background(Secondary.copy(alpha = 0.15f))
                    .padding(horizontal = 12.dp, vertical = 6.dp),
            ) {
                Text(
                    text = stringResource(R.string.mobile_scan_ready),
                    style = MaterialTheme.typography.labelSmall,
                    color = Secondary,
                    fontWeight = FontWeight.Bold,
                )
            }
        }

        Spacer(modifier = Modifier.height(18.dp))

        Button(
            onClick = onScanClick,
            modifier = Modifier
                .fillMaxWidth()
                .height(58.dp),
            shape = RoundedCornerShape(8.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = Primary,
                contentColor = Background,
            ),
        ) {
            Icon(
                imageVector = Icons.Filled.CameraAlt,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
            )
            Spacer(modifier = Modifier.width(10.dp))
            Text(
                text = stringResource(R.string.scan_qr),
                style = MaterialTheme.typography.labelLarge,
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = stringResource(R.string.desktop_qr_hint),
            style = MaterialTheme.typography.labelSmall,
            color = TextTertiary,
            modifier = Modifier.fillMaxWidth(),
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun ManualConnectCard(
    addressInput: String,
    onAddressChange: (String) -> Unit,
    onConnectClick: () -> Unit,
    hasRecent: Boolean,
    onRecentClick: () -> Unit,
    onRecentLongClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(SurfaceAlt)
            .padding(16.dp),
    ) {
        Text(
            text = stringResource(R.string.manual_connect_title),
            style = MaterialTheme.typography.titleMedium,
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = stringResource(R.string.manual_connect_subtitle),
            style = MaterialTheme.typography.bodySmall,
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = stringResource(R.string.address_label),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
        )

        Spacer(modifier = Modifier.height(8.dp))

        OutlinedTextField(
            value = addressInput,
            onValueChange = onAddressChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = {
                Text(
                    text = stringResource(R.string.address_hint),
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextTertiary,
                )
            },
            singleLine = false,
            maxLines = 2,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
            keyboardActions = KeyboardActions(onGo = { onConnectClick() }),
            shape = RoundedCornerShape(14.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = SurfaceDeep,
                unfocusedContainerColor = SurfaceDeep,
                focusedBorderColor = Primary,
                unfocusedBorderColor = Divider,
                focusedTextColor = MaterialTheme.colorScheme.onBackground,
                unfocusedTextColor = MaterialTheme.colorScheme.onBackground,
                cursorColor = Primary,
            ),
        )

        Spacer(modifier = Modifier.height(12.dp))

        OutlinedButton(
            onClick = onConnectClick,
            modifier = Modifier
                .fillMaxWidth()
                .height(50.dp),
            shape = RoundedCornerShape(8.dp),
            colors = ButtonDefaults.outlinedButtonColors(
                contentColor = Secondary,
            ),
            border = BorderStroke(1.dp, Secondary),
        ) {
            Icon(
                imageVector = Icons.Filled.Send,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
            )
            Spacer(modifier = Modifier.width(10.dp))
            Text(
                text = stringResource(R.string.connect),
                style = MaterialTheme.typography.labelLarge,
            )
        }

        if (hasRecent) {
            Spacer(modifier = Modifier.height(6.dp))
            TextButton(
                onClick = onRecentClick,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(8.dp),
            ) {
                Icon(
                    imageVector = Icons.Filled.History,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = stringResource(R.string.connect_recent),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun HealthCard(online: Boolean?, version: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(SurfaceDeep)
            .padding(15.dp),
    ) {
        Text(
            text = stringResource(R.string.service_health_title),
            style = MaterialTheme.typography.titleSmall,
        )
        Spacer(modifier = Modifier.height(3.dp))
        Text(
            text = stringResource(R.string.service_health_subtitle),
            style = MaterialTheme.typography.bodySmall,
            color = TextTertiary,
        )
        Spacer(modifier = Modifier.height(12.dp))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            val (dotColor, labelRes) = when (online) {
                true -> Success to R.string.service_status_online
                false -> MaterialTheme.colorScheme.error to R.string.service_status_offline
                null -> TextTertiary to R.string.service_status_unknown
            }
            Box(
                modifier = Modifier
                    .size(10.dp)
                    .clip(RoundedCornerShape(5.dp))
                    .background(dotColor),
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = stringResource(labelRes),
                style = MaterialTheme.typography.labelLarge,
                color = dotColor,
            )
            Spacer(modifier = Modifier.weight(1f))
            Text(
                text = "${stringResource(R.string.app_version_label)} v$version",
                style = MaterialTheme.typography.labelSmall,
                color = TextTertiary,
            )
        }
    }
}

@Composable
private fun StatusBanner(message: String, isError: Boolean) {
    val color = if (isError) {
        MaterialTheme.colorScheme.error
    } else {
        MaterialTheme.colorScheme.onSurfaceVariant
    }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(color.copy(alpha = 0.12f))
            .padding(12.dp),
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = color,
        )
    }
}

@Composable
private fun TipsCard() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(SurfaceDeep)
            .padding(15.dp),
    ) {
        TipItem(
            title = stringResource(R.string.mobile_tip_same_wifi_title),
            desc = stringResource(R.string.mobile_tip_same_wifi_desc),
        )
        HorizontalDivider(
            modifier = Modifier.padding(vertical = 12.dp),
            color = Divider,
        )
        TipItem(
            title = stringResource(R.string.mobile_tip_token_title),
            desc = stringResource(R.string.mobile_tip_token_desc),
        )
        HorizontalDivider(
            modifier = Modifier.padding(vertical = 12.dp),
            color = Divider,
        )
        TipItem(
            title = stringResource(R.string.mobile_tip_notify_title),
            desc = stringResource(R.string.mobile_tip_notify_desc),
        )
    }
}

@Composable
private fun TipItem(title: String, desc: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleSmall,
    )
    Spacer(modifier = Modifier.height(3.dp))
    Text(
        text = desc,
        style = MaterialTheme.typography.bodySmall,
    )
}
