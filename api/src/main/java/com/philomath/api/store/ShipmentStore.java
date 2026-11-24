package com.philomath.api.store;

import com.philomath.api.dto.Shipment;
import com.philomath.api.dto.ShipmentPage;
import com.philomath.api.dto.ShipmentRequest;
import com.philomath.api.dto.ShipmentStatus;
import com.philomath.api.dto.ShipmentUpdate;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
public class ShipmentStore {

    private final ShipmentRepository shipments;

    public ShipmentStore(ShipmentRepository shipments) {
        this.shipments = shipments;
    }

    @Transactional
    public Shipment create(ShipmentRequest request) {
        return shipments.save(ShipmentEntity.from(request)).toRecord();
    }

    @Transactional(readOnly = true)
    public Optional<Shipment> findById(long id) {
        return shipments.findById(id).map(ShipmentEntity::toRecord);
    }

    @Transactional(readOnly = true)
    public ShipmentPage query(long startId, int size, String reference, ShipmentStatus status) {
        String filter = reference == null ? "" : reference.trim();
        PageRequest page = PageRequest.of(0, size + 1);
        List<ShipmentEntity> rows = shipments.search(startId, filter, status, page);
        boolean more = rows.size() > size;
        List<ShipmentEntity> content = more ? rows.subList(0, size) : rows;
        String nextCursor = more ? ShipmentCursors.encode(rows.get(size).getId()) : ShipmentCursors.START;
        return new ShipmentPage(
                content.stream().map(ShipmentEntity::toRecord).toList(),
                nextCursor,
                content.size()
        );
    }

    @Transactional
    public Optional<Shipment> update(ShipmentUpdate request) {
        return shipments.findById(request.id()).map(entity -> {
            entity.apply(request);
            return shipments.save(entity).toRecord();
        });
    }

    @Transactional
    public boolean delete(long id) {
        if (!shipments.existsById(id)) {
            return false;
        }
        shipments.deleteById(id);
        return true;
    }

    @Transactional
    public void clear() {
        shipments.deleteAllInBatch();
    }
}
